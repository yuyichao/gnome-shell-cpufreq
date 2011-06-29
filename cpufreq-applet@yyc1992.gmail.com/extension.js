/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

// cpufreq-applet: Gnome shell extension displaying icons in overview mode
// Copyright (C) 2011 Yichao Yu

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

// Author: Yichao Yu
// Email: yyc1992@gmail.com

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const St = imports.gi.St;
const Shell = imports.gi.Shell;
const Signals = imports.signals;

const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const cpu_path = '/sys/devices/system/cpu/';
const cpu_dir = Gio.file_new_for_path(cpu_path);
const Schema = new Gio.Settings({ schema: 'org.gnome.shell.extensions.cpufreq' });

let settings = {};

function listdir(dir) {
    let enumerator = dir.enumerate_children(Gio.FILE_ATTRIBUTE_STANDARD_NAME, Gio.FileQueryInfoFlags.NONE, null);
    let children = [];
    let child;
    while ((child = enumerator.next_file(null)))
        children.push(child.get_name());
    return children;
}

function get_cpus() {
    let cpu_child = listdir(cpu_dir);
    let cpus = [];
    let pattern = /^cpu[0-9]+/
    for (let i in cpu_child)
        if (pattern.test(cpu_child[i]))
            cpus.push(cpu_child[i]);
    return cpus;
}

function parseInts(strs) {
    let rec = [];
    for (let i in strs)
        rec.push(parseInt(strs[i]));
    return rec;
}

function rd_frm_file(file) {
    return Shell.get_file_contents_utf8_sync(file).replace(/\n/g, '').replace(/ +/g, ' ').replace(/ +$/g, '').split(' ');
}

function rd_nums_frm_file(file) {
    return parseInts(rd_frm_file(file));
}

function num_to_freq_panel(num) {
    num = Math.round(num);
    if (num < 1000)
        return num + 'k';
    if (num < 1000000)
        return Math.round(num / 10) / 100 + 'M';
    if (num < 1000000000)
        return Math.round(num / 10000) / 100 + 'G';
    return Math.round(num / 10000000) / 100 + 'T';
}

function num_to_freq(num) {
    num = Math.round(num);
    if (num < 1000)
        return num + 'kHz';
    if (num < 1000000)
        return Math.round(num) / 1000 + 'MHz';
    if (num < 1000000000)
        return Math.round(num / 1000) / 1000 + 'GHz';
    return Math.round(num / 1000000) / 1000 + 'THz';
}

function apply_settings(key, func) {
    connect(key, Lang.bind(this, func));
    func.call(this, null);
}

function Panel_Indicator() {
    this._init.apply(this, arguments);
}

Panel_Indicator.prototype = {
    __proto__: PanelMenu.Button.prototype,

    _init: function(name, parent) {
        PanelMenu.Button.prototype._init.call(this, 0.0);
        this.actor.has_tooltip = true;
        this.actor.tooltip_text = name;
        this.actor.remove_style_class_name('panel-button');
        this.actor.add_style_class_name('cfs-panel-button');
        this.parent = parent;
        this.label = new St.Label({ text: name, style_class: 'cfs-label'});
        this.digit = new St.Label({ style_class: 'cfs-panel-value' });
        this.graph = new St.DrawingArea({reactive: false});
        this.box = new St.BoxLayout();
        this.box.add_actor(this.label);
        apply_settings.call(this, 'show-text', function(sender, value) {
            this.label.visible = value;
        });
        apply_settings.call(this, 'style', function(sender, value) {
            this.digit.visible = value == 'digit' || value == 'both';
            this.graph.visible = value == 'graph' || value == 'both';
        });
        this.box.add_actor(this.digit);
        this.actor.add_actor(this.box);
        this.add_menu_items();
        this._onChange();
        this.parent.connect('cur-changed', Lang.bind(this, this._onChange));
    },
    _onChange: function() {
        for (let i in this.menu_items) {
            let type = this.menu_items[i].type;
            let id = this.menu_items[i].id;
            this.menu_items[i].setShowDot(this.parent['avail_' + type + 's'][id] == this.parent['cur_' + type]);
        }
        this.digit.text = num_to_freq_panel(this.parent.cur_freq);
    },
    add_menu_items: function() {
        this.menu_items = [];
        for (let i in this.parent.avail_freqs) {
            let menu_item = new PopupMenu.PopupBaseMenuItem(null, {reactive: true});
            let val_label = new St.Label({ text: num_to_freq(this.parent.avail_freqs[i]) });
            menu_item.id = i;
            menu_item.type = 'freq';
            menu_item.addActor(val_label);
            this.menu.addMenuItem(menu_item);
            menu_item.connect('activate', Lang.bind(this, function(item) {
                this.parent.set_freq(item.id);
            }));
            this.menu_items.push(menu_item);
        }
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        for (let i in this.parent.avail_governors) {
            let menu_item = new PopupMenu.PopupBaseMenuItem(null, {reactive: true});
            let val_label = new St.Label({ text: this.parent.avail_governors[i] });
            menu_item.id = i;
            menu_item.type = 'governor'
            menu_item.addActor(val_label);
            this.menu.addMenuItem(menu_item);
            menu_item.connect('activate', Lang.bind(this, function(item) {
                this.parent.set_governor(item.id);
            }));
            this.menu_items.push(menu_item);
        }
    }
};

function Cpufreq_Selector() {
    this._init.apply(this, arguments);
}

Cpufreq_Selector.prototype = {
    _init: function(cpu) {
        this.cpunum = cpu.replace(/cpu/, '');
        this.cpufreq_path = cpu_path + '/' + cpu + '/cpufreq/';
        this.get_freqs();
        this.get_governors();
        this.get_cur_freq();
        this.get_cur_governor();
        this.indicator = new Panel_Indicator(cpu, this);
    },

    get_freqs: function() {
        this.max = rd_nums_frm_file(this.cpufreq_path + '/scaling_max_freq')[0];
        this.min = rd_nums_frm_file(this.cpufreq_path + '/scaling_min_freq')[0];
        this.avail_freqs = rd_nums_frm_file(this.cpufreq_path + '/scaling_available_frequencies');
    },
    get_governors: function() {
        this.avail_governors = rd_frm_file(this.cpufreq_path + '/scaling_available_governors');
    },

    get_cur_freq: function() {
        this.cur_freq = rd_nums_frm_file(this.cpufreq_path + '/scaling_cur_freq')[0];
    },
    get_cur_governor: function() {
        this.cur_governor = rd_frm_file(this.cpufreq_path + '/scaling_governor')[0];
    },

    set_freq: function(index) {
        let res = GLib.spawn_sync(null, ['cpufreq-selector', '-c', this.cpunum.toString(), '-f', this.avail_freqs[index].toString()], null, GLib.SpawnFlags.SEARCH_PATH, null);
        this.update();
        return res[0] && res[3] == 0;
    },
    set_governor: function(index) {
        let res = GLib.spawn_sync(null, ['cpufreq-selector', '-c', this.cpunum.toString(), '-g', this.avail_governors[index]], null, GLib.SpawnFlags.SEARCH_PATH, null);
        this.update();
        return res[0] && res[3] == 0;
    },

    update: function() {
        let old_freq = this.cur_freq;
        let old_governor = this.cur_governor;
        this.get_cur_freq();
        this.get_cur_governor();
        if (old_freq != this.cur_freq || old_governor != this.cur_governor)
            this.emit('cur-changed');
    }
};
Signals.addSignalMethods(Cpufreq_Selector.prototype);

Signals.addSignalMethods(this);
function callback(schema, key, func) {
    settings[key] = schema[func](key);
    emit(key, settings[key]);
}

function apply_and_connect(key, func) {
    callback(Schema, key, func);
    Schema.connect('changed::' + key, Lang.bind(this, callback, func));
}

function main() {
    this.cpus = get_cpus();
    let panel = Main.panel._rightBox;
    let box = new St.BoxLayout();
    panel.insert_actor(box, 1);
    panel.child_set(box, { y_fill: true });
    this.selectors = [];
    for (let i in cpus) {
        this.selectors[i] = new Cpufreq_Selector(cpus[i]);
        box.add_actor(selectors[i].indicator.actor);
        Main.panel._menus.addMenu(selectors[i].indicator.menu);
    }
    apply_and_connect('cpus-hidden', 'get_strv');
    apply_and_connect('digit-type', 'get_string');
    apply_and_connect('graph-width', 'get_int');
    apply_and_connect('refresh-time', 'get_int');
    apply_and_connect('show-text', 'get_boolean');
    apply_and_connect('style', 'get_string');
}
