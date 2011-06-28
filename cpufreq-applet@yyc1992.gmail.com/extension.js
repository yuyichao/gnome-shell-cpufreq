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
const Lang = imports.lang;

const cpu_path = '/sys/devices/system/cpu/';
const cpu_dir = Gio.file_new_for_path(cpu_path);
let cpus = [];
let selectors = [];

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
        GLib.spawn_sync('.', ['cpufreq-selector', '-c', this.cpunum, '-f', this.avail_freqs[index].toString()], [], GLib.SpawnFlags.SEARCH_PATH, null);
    },
    set_governor: function(index) {
        GLib.spawn_sync('.', ['cpufreq-selector', '-c', this.cpunum, '-g', this.avail_governors[index]], [], GLib.SpawnFlags.SEARCH_PATH, null);
    }
};

function main() {
    cpus = get_cpus();
    for (let i in cpus) {
        selectors[i] = new Cpufreq_Selector(cpus[i]);
        for (let j in selectors[i]) {
            if (typeof(selectors[i][j]) != 'function')
                print(selectors[i][j]);
        }
    }
}
