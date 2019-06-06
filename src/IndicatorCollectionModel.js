/*jshint moz:true */
// vi: sw=2 sts=2 et

const Lang = imports.lang;
const Signals = imports.signals;

const Gtk = imports.gi.Gtk;
const GObject = imports.gi.GObject;

const Local = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Local.imports.convenience;
const { ApiService } = Local.imports;


const INDICATORS_KEY = "indicators";

var Defaults = {
  api: "bitcoinaverage",
  base: "BTC",
  quote: "USD",
  attribute: "last",
  show_change: true,
  format: "{v} {qs}"
};

const ConfigModel = new Lang.Class({
  Name: "ConfigModel",

  _init(attributes) {
    this.attributes = attributes;
  },

  set(key, value) {
    this.attributes[key] = value;
    this.emit("update", key, value);
  },

  get(key) {
    if (key in this.attributes) {
      return this.attributes[key];
    }
    return Defaults[key];
  },

  toString() {
    return JSON.stringify(this.attributes);
  },

  destroy() {
    this.disconnectAll();
  }
});

Signals.addSignalMethods(ConfigModel.prototype);



const IndicatorCollectionModel = new GObject.Class({
  Name: "BitcoinMarkets.IndicatorCollectionModel",
  GTypeName: "IndicatorCollectionModel",
  Extends: Gtk.ListStore,

  Columns: {
    LABEL: 0,
    CONFIG: 1
  },

  _init(params) {
    this.parent(params);

    this.set_column_types([GObject.TYPE_STRING, GObject.TYPE_STRING]);

    this._settings = Convenience.getSettings();

    this._reloadFromSettings();

    var flag;

    const mutex = (func) =>
      function() {
        if (!flag) {
          flag = true;
          func.apply(null, arguments);
          flag = false;
        }
      }

    this.connect("row-changed", mutex(this._onRowChanged.bind(this)));

    this.connect("row-inserted", mutex(this._onRowInserted.bind(this)));

    this.connect("row-deleted", mutex(this._onRowDeleted.bind(this)));
  },

  getConfig(iter) {
    const json = this.get_value(iter, this.Columns.CONFIG);

    if (!json) {
      throw new Error("getConfig() failed for iter=" + iter);
    }

    const config = new ConfigModel(JSON.parse(json));

    config.connect("update", () => {
      this.set(
        iter,
        [this.Columns.CONFIG],
        [config.toString()]
      );
    });

    return config;
  },

  _getLabel(config) {
    try {
      return ApiService.getProvider(config.api).getLabel(config);
    } catch (e) {
      logError(e);
      return `[unsupported: ${config.api}]`;
    }
  },

  _reloadFromSettings() {
    this.clear();

    const configs = this._settings.get_strv(INDICATORS_KEY);

    Object.keys(configs).forEach(key => {
      const json = configs[key];
      try {
        const label = this._getLabel(JSON.parse(json));
        this.set(
          this.append(),
          [this.Columns.LABEL, this.Columns.CONFIG],
          [label, json]
        );
      } catch (e) {
        logError("error loading indicator config", e);
      }
    });
  },

  _writeSettings() {
    // eslint-disable-next-line
    let [res, iter] = this.get_iter_first();
    const configs = [];

    while (res) {
      configs.push(this.get_value(iter, this.Columns.CONFIG));
      res = this.iter_next(iter);
    }

    this._settings.set_strv(INDICATORS_KEY, configs);
  },

  _onRowChanged(self, path, iter) {
    const config = this.get_value(iter, this.Columns.CONFIG);

    this.set(
      iter,
      [this.Columns.LABEL, this.Columns.CONFIG],
      [this._getLabel(JSON.parse(config)), config]
    );

    this._writeSettings();
  },

  _onRowInserted(self, path, iter) {
    this.set(
      iter,
      [this.Columns.LABEL, this.Columns.CONFIG],
      [this._getLabel(Defaults), JSON.stringify(Defaults)]
    );

    this._writeSettings();
  },

  _onRowDeleted(self, path, iter) {
    this._writeSettings();
  }
});
