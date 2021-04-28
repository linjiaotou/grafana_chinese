package notifier

import (
	"context"
	"crypto/md5"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"path/filepath"
	"sync"
	"time"

	gokit_log "github.com/go-kit/kit/log"
	amv2 "github.com/prometheus/alertmanager/api/v2/models"
	"github.com/prometheus/alertmanager/dispatch"
	"github.com/prometheus/alertmanager/inhibit"
	"github.com/prometheus/alertmanager/nflog"
	"github.com/prometheus/alertmanager/nflog/nflogpb"
	"github.com/prometheus/alertmanager/notify"
	"github.com/prometheus/alertmanager/provider/mem"
	"github.com/prometheus/alertmanager/silence"
	"github.com/prometheus/alertmanager/template"
	"github.com/prometheus/alertmanager/types"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/common/model"

	"github.com/grafana/grafana/pkg/components/securejsondata"
	"github.com/grafana/grafana/pkg/infra/log"
	"github.com/grafana/grafana/pkg/models"
	"github.com/grafana/grafana/pkg/registry"
	"github.com/grafana/grafana/pkg/services/alerting"
	apimodels "github.com/grafana/grafana/pkg/services/ngalert/api/tooling/definitions"
	ngmodels "github.com/grafana/grafana/pkg/services/ngalert/models"
	"github.com/grafana/grafana/pkg/services/ngalert/notifier/channels"
	"github.com/grafana/grafana/pkg/services/ngalert/store"
	"github.com/grafana/grafana/pkg/services/sqlstore"
	"github.com/grafana/grafana/pkg/services/sqlstore/migrator"
	"github.com/grafana/grafana/pkg/setting"
)

const (
	pollInterval = 1 * time.Minute
	workingDir   = "alerting"
	// How long should we keep silences and notification entries on-disk after they've served their purpose.
	retentionNotificationsAndSilences = 5 * 24 * time.Hour
	// maintenanceNotificationAndSilences how often should we flush and gargabe collect notifications and silences
	maintenanceNotificationAndSilences = 15 * time.Minute
	// defaultResolveTimeout is the default timeout used for resolving an alert
	// if the end time is not specified.
	defaultResolveTimeout = 5 * time.Minute
	// memoryAlertsGCInterval is the interval at which we'll remove resolved alerts from memory.
	memoryAlertsGCInterval = 30 * time.Minute
	// To start, the alertmanager needs at least one route defined.
	// TODO: we should move this to Grafana settings and define this as the default.
	alertmanagerDefaultConfiguration = `
{
	"alertmanager_config": {
		"route": {
			"receiver": "grafana-default-email"
		},
		"receivers": [{
			"name": "grafana-default-email",
			"grafana_managed_receiver_configs": [{
				"uid": "",
				"name": "email receiver",
				"type": "email",
				"isDefault": true,
				"settings": {
					"addresses": "<example@email.com>"
				}
			}]
		}]
	}
}
`
)

type Alertmanager struct {
	logger   log.Logger
	Settings *setting.Cfg       `inject:""`
	SQLStore *sqlstore.SQLStore `inject:""`
	Store    store.AlertingStore

	notificationLog *nflog.Log
	marker          types.Marker
	alerts          *mem.Alerts
	route           *dispatch.Route

	dispatcher *dispatch.Dispatcher
	inhibitor  *inhibit.Inhibitor
	// wg is for dispatcher, inhibitor, silences and notifications
	// Across configuration changes dispatcher and inhibitor are completely replaced, however, silences, notification log and alerts remain the same.
	// stopc is used to let silences and notifications know we are done.
	wg    sync.WaitGroup
	stopc chan struct{}

	silencer *silence.Silencer
	silences *silence.Silences

	stageMetrics      *notify.Metrics
	dispatcherMetrics *dispatch.DispatcherMetrics

	reloadConfigMtx sync.RWMutex
	config          []byte
}

func init() {
	registry.RegisterService(&Alertmanager{})
}

func (am *Alertmanager) IsDisabled() bool {
	if am.Settings == nil {
		return true
	}
	return !am.Settings.IsNgAlertEnabled()
}

func (am *Alertmanager) Init() (err error) {
	am.stopc = make(chan struct{})
	am.logger = log.New("alertmanager")
	r := prometheus.NewRegistry()
	am.marker = types.NewMarker(r)
	am.stageMetrics = notify.NewMetrics(r)
	am.dispatcherMetrics = dispatch.NewDispatcherMetrics(r)
	am.Store = store.DBstore{SQLStore: am.SQLStore}

	// Initialize the notification log
	am.wg.Add(1)
	am.notificationLog, err = nflog.New(
		nflog.WithRetention(retentionNotificationsAndSilences),
		nflog.WithSnapshot(filepath.Join(am.WorkingDirPath(), "notifications")),
		nflog.WithMaintenance(maintenanceNotificationAndSilences, am.stopc, am.wg.Done),
	)
	if err != nil {
		return fmt.Errorf("unable to initialize the notification log component of alerting: %w", err)
	}
	// Initialize silences
	am.silences, err = silence.New(silence.Options{
		SnapshotFile: filepath.Join(am.WorkingDirPath(), "silences"),
		Retention:    retentionNotificationsAndSilences,
	})
	if err != nil {
		return fmt.Errorf("unable to initialize the silencing component of alerting: %w", err)
	}

	am.wg.Add(1)
	go func() {
		am.silences.Maintenance(15*time.Minute, filepath.Join(am.WorkingDirPath(), "silences"), am.stopc)
		am.wg.Done()
	}()

	// Initialize in-memory alerts
	am.alerts, err = mem.NewAlerts(context.Background(), am.marker, memoryAlertsGCInterval, gokit_log.NewNopLogger())
	if err != nil {
		return fmt.Errorf("unable to initialize the alert provider component of alerting: %w", err)
	}

	return nil
}

func (am *Alertmanager) Run(ctx context.Context) error {
	// Make sure dispatcher starts. We can tolerate future reload failures.
	if err := am.SyncAndApplyConfigFromDatabase(); err != nil {
		am.logger.Error("unable to sync configuration", "err", err)
	}

	for {
		select {
		case <-ctx.Done():
			return am.StopAndWait()
		case <-time.After(pollInterval):
			if err := am.SyncAndApplyConfigFromDatabase(); err != nil {
				am.logger.Error("unable to sync configuration", "err", err)
			}
		}
	}
}

// AddMigration runs the database migrations as the service starts.
func (am *Alertmanager) AddMigration(mg *migrator.Migrator) {
	alertmanagerConfigurationMigration(mg)
}

func (am *Alertmanager) StopAndWait() error {
	if am.dispatcher != nil {
		am.dispatcher.Stop()
	}

	if am.inhibitor != nil {
		am.inhibitor.Stop()
	}

	am.alerts.Close()

	close(am.stopc)

	am.wg.Wait()
	return nil
}

func (am *Alertmanager) SaveAndApplyConfig(cfg *apimodels.PostableUserConfig) error {
	rawConfig, err := json.Marshal(&cfg)
	if err != nil {
		return fmt.Errorf("failed to serialize to the Alertmanager configuration: %w", err)
	}

	am.reloadConfigMtx.Lock()
	defer am.reloadConfigMtx.Unlock()

	cmd := &ngmodels.SaveAlertmanagerConfigurationCmd{
		AlertmanagerConfiguration: string(rawConfig),
		ConfigurationVersion:      fmt.Sprintf("v%d", ngmodels.AlertConfigurationVersion),
	}

	if err := am.Store.SaveAlertmanagerConfiguration(cmd); err != nil {
		return fmt.Errorf("failed to save Alertmanager configuration: %w", err)
	}
	if err := am.applyConfig(cfg); err != nil {
		return fmt.Errorf("unable to reload configuration: %w", err)
	}

	return nil
}

// SyncAndApplyConfigFromDatabase picks the latest config from database and restarts
// the components with the new config.
func (am *Alertmanager) SyncAndApplyConfigFromDatabase() error {
	am.reloadConfigMtx.Lock()
	defer am.reloadConfigMtx.Unlock()

	// First, let's get the configuration we need from the database.
	q := &ngmodels.GetLatestAlertmanagerConfigurationQuery{}
	if err := am.Store.GetLatestAlertmanagerConfiguration(q); err != nil {
		// If there's no configuration in the database, let's use the default configuration.
		if errors.Is(err, store.ErrNoAlertmanagerConfiguration) {
			q.Result = &ngmodels.AlertConfiguration{AlertmanagerConfiguration: alertmanagerDefaultConfiguration}
		} else {
			return fmt.Errorf("unable to get Alertmanager configuration from the database: %w", err)
		}
	}

	cfg, err := Load([]byte(q.Result.AlertmanagerConfiguration))
	if err != nil {
		return err
	}

	if err := am.applyConfig(cfg); err != nil {
		return fmt.Errorf("unable to reload configuration: %w", err)
	}

	return nil
}

// ApplyConfig applies a new configuration by re-initializing all components using the configuration provided.
func (am *Alertmanager) ApplyConfig(cfg *apimodels.PostableUserConfig) error {
	am.reloadConfigMtx.Lock()
	defer am.reloadConfigMtx.Unlock()

	return am.applyConfig(cfg)
}

const defaultTemplate = "templates/default.tmpl"

// applyConfig applies a new configuration by re-initializing all components using the configuration provided.
// It is not safe to call concurrently.
func (am *Alertmanager) applyConfig(cfg *apimodels.PostableUserConfig) error {
	// First, let's make sure this config is not already loaded
	var configChanged bool
	rawConfig, err := json.Marshal(cfg.AlertmanagerConfig)
	if err != nil {
		// In theory, this should never happen.
		return err
	}

	if md5.Sum(am.config) != md5.Sum(rawConfig) {
		configChanged = true
	}
	// next, we need to make sure we persist the templates to disk.
	paths, templatesChanged, err := PersistTemplates(cfg, am.WorkingDirPath())
	if err != nil {
		return err
	}

	// If neither the configuration nor templates have changed, we've got nothing to do.
	if !configChanged && !templatesChanged {
		am.logger.Debug("neither config nor template have changed, skipping configuration sync.")
		return nil
	}

	paths = append([]string{defaultTemplate}, paths...)

	// With the templates persisted, create the template list using the paths.
	tmpl, err := template.FromGlobs(paths...)
	if err != nil {
		return err
	}
	externalURL, err := url.Parse(am.Settings.AppURL)
	if err != nil {
		return err
	}
	tmpl.ExternalURL = externalURL

	// Finally, build the integrations map using the receiver configuration and templates.
	integrationsMap, err := am.buildIntegrationsMap(cfg.AlertmanagerConfig.Receivers, tmpl)
	if err != nil {
		return err
	}
	// Now, let's put together our notification pipeline
	routingStage := make(notify.RoutingStage, len(integrationsMap))

	if am.inhibitor != nil {
		am.inhibitor.Stop()
	}
	if am.dispatcher != nil {
		am.dispatcher.Stop()
	}

	am.inhibitor = inhibit.NewInhibitor(am.alerts, cfg.AlertmanagerConfig.InhibitRules, am.marker, gokit_log.NewNopLogger())
	am.silencer = silence.NewSilencer(am.silences, am.marker, gokit_log.NewNopLogger())

	inhibitionStage := notify.NewMuteStage(am.inhibitor)
	silencingStage := notify.NewMuteStage(am.silencer)
	for name := range integrationsMap {
		stage := am.createReceiverStage(name, integrationsMap[name], waitFunc, am.notificationLog)
		routingStage[name] = notify.MultiStage{silencingStage, inhibitionStage, stage}
	}

	am.route = dispatch.NewRoute(cfg.AlertmanagerConfig.Route, nil)
	am.dispatcher = dispatch.NewDispatcher(am.alerts, am.route, routingStage, am.marker, timeoutFunc, gokit_log.NewNopLogger(), am.dispatcherMetrics)

	am.wg.Add(1)
	go func() {
		defer am.wg.Done()
		am.dispatcher.Run()
	}()

	am.wg.Add(1)
	go func() {
		defer am.wg.Done()
		am.inhibitor.Run()
	}()

	am.config = rawConfig
	return nil
}

func (am *Alertmanager) WorkingDirPath() string {
	return filepath.Join(am.Settings.DataPath, workingDir)
}

// buildIntegrationsMap builds a map of name to the list of Grafana integration notifiers off of a list of receiver config.
func (am *Alertmanager) buildIntegrationsMap(receivers []*apimodels.PostableApiReceiver, templates *template.Template) (map[string][]notify.Integration, error) {
	integrationsMap := make(map[string][]notify.Integration, len(receivers))
	for _, receiver := range receivers {
		integrations, err := am.buildReceiverIntegrations(receiver, templates)
		if err != nil {
			return nil, err
		}
		integrationsMap[receiver.Name] = integrations
	}

	return integrationsMap, nil
}

type NotificationChannel interface {
	notify.Notifier
	notify.ResolvedSender
}

// buildReceiverIntegrations builds a list of integration notifiers off of a receiver config.
func (am *Alertmanager) buildReceiverIntegrations(receiver *apimodels.PostableApiReceiver, tmpl *template.Template) ([]notify.Integration, error) {
	var integrations []notify.Integration

	for i, r := range receiver.GrafanaManagedReceivers {
		var (
			cfg = &models.AlertNotification{
				Uid:                   r.Uid,
				Name:                  r.Name,
				Type:                  r.Type,
				IsDefault:             r.IsDefault,
				SendReminder:          r.SendReminder,
				DisableResolveMessage: r.DisableResolveMessage,
				Settings:              r.Settings,
				SecureSettings:        securejsondata.GetEncryptedJsonData(r.SecureSettings),
			}
			n   NotificationChannel
			err error
		)
		switch r.Type {
		case "email":
			n, err = channels.NewEmailNotifier(cfg, tmpl.ExternalURL) // Email notifier already has a default template.
		case "pagerduty":
			n, err = channels.NewPagerdutyNotifier(cfg, tmpl)
		case "slack":
			n, err = channels.NewSlackNotifier(cfg, tmpl)
		case "telegram":
			n, err = channels.NewTelegramNotifier(cfg, tmpl)
		case "teams":
			n, err = channels.NewTeamsNotifier(cfg, tmpl)
		case "dingding":
			n, err = channels.NewDingDingNotifier(cfg, tmpl)
		case "webhook":
			n, err = channels.NewWebHookNotifier(cfg, tmpl)
		}
		if err != nil {
			return nil, err
		}
		integrations = append(integrations, notify.NewIntegration(n, n, r.Name, i))
	}

	return integrations, nil
}

// PutAlerts receives the alerts and then sends them through the corresponding route based on whenever the alert has a receiver embedded or not
func (am *Alertmanager) PutAlerts(postableAlerts apimodels.PostableAlerts) error {
	now := time.Now()
	alerts := make([]*types.Alert, 0, len(postableAlerts.PostableAlerts))
	var validationErr *AlertValidationError
	for _, a := range postableAlerts.PostableAlerts {
		alert := &types.Alert{
			Alert: model.Alert{
				Labels:       model.LabelSet{},
				Annotations:  model.LabelSet{},
				StartsAt:     time.Time(a.StartsAt),
				EndsAt:       time.Time(a.EndsAt),
				GeneratorURL: a.GeneratorURL.String(),
			},
			UpdatedAt: now,
		}
		for k, v := range a.Labels {
			if len(v) == 0 { // Skip empty labels.
				continue
			}
			alert.Alert.Labels[model.LabelName(k)] = model.LabelValue(v)
		}
		for k, v := range a.Annotations {
			if len(v) == 0 { // Skip empty annotation.
				continue
			}
			alert.Alert.Annotations[model.LabelName(k)] = model.LabelValue(v)
		}

		// Ensure StartsAt is set.
		if alert.StartsAt.IsZero() {
			if alert.EndsAt.IsZero() {
				alert.StartsAt = now
			} else {
				alert.StartsAt = alert.EndsAt
			}
		}
		// If no end time is defined, set a timeout after which an alert
		// is marked resolved if it is not updated.
		if alert.EndsAt.IsZero() {
			alert.Timeout = true
			alert.EndsAt = now.Add(defaultResolveTimeout)
		}

		if err := alert.Validate(); err != nil {
			if validationErr == nil {
				validationErr = &AlertValidationError{}
			}
			validationErr.Alerts = append(validationErr.Alerts, a)
			validationErr.Errors = append(validationErr.Errors, err)
			continue
		}

		alerts = append(alerts, alert)
	}

	if err := am.alerts.Put(alerts...); err != nil {
		// Notification sending alert takes precedence over validation errors.
		return err
	}
	if validationErr != nil {
		// Even if validationErr is nil, the require.NoError fails on it.
		return validationErr
	}
	return nil
}

// AlertValidationError is the error capturing the validation errors
// faced on the alerts.
type AlertValidationError struct {
	Alerts []amv2.PostableAlert
	Errors []error // Errors[i] refers to Alerts[i].
}

func (e AlertValidationError) Error() string {
	errMsg := ""
	if len(e.Errors) != 0 {
		errMsg := e.Errors[0].Error()
		for _, e := range e.Errors[1:] {
			errMsg += ";" + e.Error()
		}
	}
	return errMsg
}

// createReceiverStage creates a pipeline of stages for a receiver.
func (am *Alertmanager) createReceiverStage(name string, integrations []notify.Integration, wait func() time.Duration, notificationLog notify.NotificationLog) notify.Stage {
	var fs notify.FanoutStage
	for i := range integrations {
		recv := &nflogpb.Receiver{
			GroupName:   name,
			Integration: integrations[i].Name(),
			Idx:         uint32(integrations[i].Index()),
		}
		var s notify.MultiStage
		s = append(s, notify.NewWaitStage(wait))
		s = append(s, notify.NewDedupStage(&integrations[i], notificationLog, recv))
		s = append(s, notify.NewRetryStage(integrations[i], name, am.stageMetrics))
		s = append(s, notify.NewSetNotifiesStage(notificationLog, recv))

		fs = append(fs, s)
	}
	return fs
}

func waitFunc() time.Duration {
	return setting.AlertingNotificationTimeout
}

func timeoutFunc(d time.Duration) time.Duration {
	//TODO: What does MinTimeout means here?
	if d < notify.MinTimeout {
		d = notify.MinTimeout
	}
	return d + waitFunc()
}

// GetAvailableNotifiers returns the metadata of all the notification channels that can be configured.
func (am *Alertmanager) GetAvailableNotifiers() []*alerting.NotifierPlugin {
	return []*alerting.NotifierPlugin{
		{
			Type:        "dingding",
			Name:        "DingDing",
			Description: "Sends HTTP POST request to DingDing",
			Heading:     "DingDing settings",
			Options: []alerting.NotifierOption{
				{
					Label:        "Url",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					Placeholder:  "https://oapi.dingtalk.com/robot/send?access_token=xxxxxxxxx",
					PropertyName: "url",
					Required:     true,
				},
				{
					Label:        "Message Type",
					Element:      alerting.ElementTypeSelect,
					PropertyName: "msgType",
					SelectOptions: []alerting.SelectOption{
						{
							Value: "link",
							Label: "Link"},
						{
							Value: "actionCard",
							Label: "ActionCard",
						},
					},
				},
				{ // New in 8.0.
					Label:        "Message",
					Element:      alerting.ElementTypeTextArea,
					Placeholder:  `{{ template "default.message" . }}`,
					PropertyName: "message",
				},
			},
		},
		{
			Type:        "email",
			Name:        "Email",
			Description: "Sends notifications using Grafana server configured SMTP settings",
			Heading:     "Email settings",
			Options: []alerting.NotifierOption{
				{
					Label:        "Single email",
					Description:  "Send a single email to all recipients",
					Element:      alerting.ElementTypeCheckbox,
					PropertyName: "singleEmail",
				},
				{
					Label:        "Addresses",
					Description:  "You can enter multiple email addresses using a \";\" separator",
					Element:      alerting.ElementTypeTextArea,
					PropertyName: "addresses",
					Required:     true,
				},
			},
		},
		{
			Type:        "pagerduty",
			Name:        "PagerDuty",
			Description: "Sends notifications to PagerDuty",
			Heading:     "PagerDuty settings",
			Options: []alerting.NotifierOption{
				{
					Label:        "Integration Key",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					Placeholder:  "Pagerduty Integration Key",
					PropertyName: "integrationKey",
					Required:     true,
					Secure:       true,
				},
				{
					Label:   "Severity",
					Element: alerting.ElementTypeSelect,
					SelectOptions: []alerting.SelectOption{
						{
							Value: "critical",
							Label: "Critical",
						},
						{
							Value: "error",
							Label: "Error",
						},
						{
							Value: "warning",
							Label: "Warning",
						},
						{
							Value: "info",
							Label: "Info",
						},
					},
					PropertyName: "severity",
				},
				{ // New in 8.0.
					Label:        "Class",
					Description:  "The class/type of the event, for example 'ping failure' or 'cpu load'",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					PropertyName: "class",
				},
				{ // New in 8.0.
					Label:        "Component",
					Description:  "Component of the source machine that is responsible for the event, for example mysql or eth0",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					Placeholder:  "Grafana",
					PropertyName: "component",
				},
				{ // New in 8.0.
					Label:        "Group",
					Description:  "Logical grouping of components of a service, for example 'app-stack'",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					PropertyName: "group",
				},
				{ // New in 8.0.
					Label:        "Summary",
					Description:  "You can use templates for summary",
					Element:      alerting.ElementTypeTextArea,
					Placeholder:  `{{ template "default.message" . }}`,
					PropertyName: "summary",
				},
			},
		},
		{
			Type:        "slack",
			Name:        "Slack",
			Description: "Sends notifications to Slack",
			Heading:     "Slack settings",
			Options: []alerting.NotifierOption{
				{
					Label:        "Recipient",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					Description:  "Specify channel or user, use #channel-name, @username (has to be all lowercase, no whitespace), or user/channel Slack ID - required unless you provide a webhook",
					PropertyName: "recipient",
				},
				// Logically, this field should be required when not using a webhook, since the Slack API needs a token.
				// However, since the UI doesn't allow to say that a field is required or not depending on another field,
				// we've gone with the compromise of making this field optional and instead return a validation error
				// if it's necessary and missing.
				{
					Label:        "Token",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					Description:  "Provide a Slack API token (starts with \"xoxb\") - required unless you provide a webhook",
					PropertyName: "token",
					Secure:       true,
				},
				{
					Label:        "Username",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					Description:  "Set the username for the bot's message",
					PropertyName: "username",
				},
				{
					Label:        "Icon emoji",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					Description:  "Provide an emoji to use as the icon for the bot's message. Overrides the icon URL.",
					PropertyName: "iconEmoji",
				},
				{
					Label:        "Icon URL",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					Description:  "Provide a URL to an image to use as the icon for the bot's message",
					PropertyName: "iconUrl",
				},
				{
					Label:        "Mention Users",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					Description:  "Mention one or more users (comma separated) when notifying in a channel, by ID (you can copy this from the user's Slack profile)",
					PropertyName: "mentionUsers",
				},
				{
					Label:        "Mention Groups",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					Description:  "Mention one or more groups (comma separated) when notifying in a channel (you can copy this from the group's Slack profile URL)",
					PropertyName: "mentionGroups",
				},
				{
					Label:   "Mention Channel",
					Element: alerting.ElementTypeSelect,
					SelectOptions: []alerting.SelectOption{
						{
							Value: "",
							Label: "Disabled",
						},
						{
							Value: "here",
							Label: "Every active channel member",
						},
						{
							Value: "channel",
							Label: "Every channel member",
						},
					},
					Description:  "Mention whole channel or just active members when notifying",
					PropertyName: "mentionChannel",
				},
				{
					Label:        "Webhook URL",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					Description:  "Optionally provide a Slack incoming webhook URL for sending messages, in this case the token isn't necessary",
					Placeholder:  "Slack incoming webhook URL",
					PropertyName: "url",
					Secure:       true,
				},
				{ // New in 8.0.
					Label:        "Title",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					Description:  "Templated title of the slack message",
					PropertyName: "title",
					Placeholder:  `{{ template "slack.default.title" . }}`,
				},
				{ // New in 8.0.
					Label:        "Text Body",
					Element:      alerting.ElementTypeTextArea,
					Description:  "Body of the slack message",
					PropertyName: "text",
					Placeholder:  `{{ template "slack.default.text" . }}`,
				},
			},
		},
		{
			Type:        "teams",
			Name:        "Microsoft Teams",
			Description: "Sends notifications using Incoming Webhook connector to Microsoft Teams",
			Heading:     "Teams settings",
			Options: []alerting.NotifierOption{
				{
					Label:        "URL",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					Placeholder:  "Teams incoming webhook url",
					PropertyName: "url",
					Required:     true,
				},
				{ // New in 8.0.
					Label:        "Message",
					Element:      alerting.ElementTypeTextArea,
					Placeholder:  `{{ template "default.message" . }}`,
					PropertyName: "message",
				},
			},
		},
		{
			Type:        "telegram",
			Name:        "Telegram",
			Description: "Sends notifications to Telegram",
			Heading:     "Telegram API settings",
			Options: []alerting.NotifierOption{
				{
					Label:        "BOT API Token",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					Placeholder:  "Telegram BOT API Token",
					PropertyName: "bottoken",
					Required:     true,
					Secure:       true,
				},
				{
					Label:        "Chat ID",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					Description:  "Integer Telegram Chat Identifier",
					PropertyName: "chatid",
					Required:     true,
				},
				{ // New in 8.0.
					Label:        "Message",
					Element:      alerting.ElementTypeTextArea,
					Placeholder:  `{{ template "default.message" . }}`,
					PropertyName: "message",
				},
			},
		},
		{
			Type:        "webhook",
			Name:        "webhook",
			Description: "Sends HTTP POST request to a URL",
			Heading:     "Webhook settings",
			Options: []alerting.NotifierOption{
				{
					Label:        "Url",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					PropertyName: "url",
					Required:     true,
				},
				{
					Label:   "Http Method",
					Element: alerting.ElementTypeSelect,
					SelectOptions: []alerting.SelectOption{
						{
							Value: "POST",
							Label: "POST",
						},
						{
							Value: "PUT",
							Label: "PUT",
						},
					},
					PropertyName: "httpMethod",
				},
				{
					Label:        "Username",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					PropertyName: "username",
				},
				{
					Label:        "Password",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypePassword,
					PropertyName: "password",
					Secure:       true,
				},
				{ // New in 8.0. TODO: How to enforce only numbers?
					Label:        "Max Alerts",
					Description:  "Max alerts to include in a notification. Remaining alerts in the same batch will be ignored above this number. 0 means no limit.",
					Element:      alerting.ElementTypeInput,
					InputType:    alerting.InputTypeText,
					PropertyName: "maxAlerts",
				},
			},
		},
	}
}
