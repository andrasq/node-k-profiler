/*
 * Copyright (c) 2016, Kinvey, Inc. All rights reserved.
 *
 * This software is licensed to you under the Kinvey terms of service located at
 * http://www.kinvey.com/terms-of-use. By downloading, accessing and/or using this
 * software, you hereby accept such terms of service  (and any agreement referenced
 * therein) and agree that you have read, understand and agree to be bound by such
 * terms of service and are of legal age to agree to such terms with Kinvey.
 *
 * This software contains valuable confidential and proprietary information of
 * KINVEY, INC and is subject to applicable licensing agreements.
 * Unauthorized reproduction, transmission or distribution of this file and its
 * contents is a violation of applicable laws.
 */

'use strict';

var fs = require('fs');
var v8profiler = require('v8-profiler');
var events = require('events');
var util = require('util');


function KProfiler( ) {
    events.EventEmitter.call(this);

    this.maxSignalDelay = 50;           // longest back-to-back signal spacing
    this._verbose = true;               // report on actions

    this.isProfiling = false;           // set when gathering execution profile data
    this.isBusy = false;                // set when busy saving profile

    this._handleUsr1 = null;
    this._handleUsr2 = null;
}
util.inherits(KProfiler, events.EventEmitter);

/*
 * on SIGUSR1 start/stop execution profiling
 */
KProfiler.prototype.onUsr1Signal = function onUsr1Signal() {
    this.emit('signal', 'SIGUSR1');
    if (this._checkIfBusy('SIGUSR1')) return this;

    if (!this.isProfiling) {
        // start an execution trace
        this.log("capturing execution profile");
        v8profiler.startProfiling('', true);
        this.isProfiling = true;
    }
    else {
        // save the execution profile currently being traced
        var profile = v8profiler.stopProfiling('');
        this.isProfiling = false;
        this.isBusy = true;
        if (profile) {
            var self = this;
            var profileFilename = 'v8profile-' + new Date().toISOString() + '.cpuprofile';
            this._exportProfile(profile, 'execution profile', profileFilename, function(err) {
                self.isBusy = false;
            });
        }
        else this.log("unable to obtain execution profile");
    }
    return this;
}

/*
 * on SIGUSR2 capture a heap snapshot
 */
KProfiler.prototype.onUsr2Signal = function onUsr2Signal() {
    this.emit('signal', 'SIGUSR2');
    if (this._checkIfBusy('SIGUSR2')) return this;

    this.isBusy = true;
    var profile = v8profiler.takeSnapshot();
    var profileFilename = 'heapdump-' + new Date().toISOString() + '.heapsnapshot';
    if (profile) {
        var self = this;
        this._exportProfile(profile, 'heap snapshot', profileFilename, function(err) {
            self.isBusy = false;
        });
    }
    else this.log("unable to obtain heap snapshot");
    return this;
}

KProfiler.prototype.log = function log(format, arg1) {
    if (this._verbose) {
        console.log(new Date().toISOString() + " -- k-profiler: " + util.format.apply(null, arguments));
    }
}

KProfiler.prototype.verbose = function verbose( yesno ) {
    var oldVerbose = this._verbose;
    if (yesno !== undefined) {
        this._verbose = yesno ? true : false;
    }
    return oldVerbose;
}

KProfiler.prototype.install = function install() {
    this._handleUsr1 = this.onUsr1Signal.bind(this);
    this._handleUsr2 = this.onUsr2Signal.bind(this);
    process.on('SIGUSR1', this._handleUsr1);
    process.on('SIGUSR2', this._handleUsr2);
    return this;
};

KProfiler.prototype.uninstall = function uninstall() {
    process.removeListener('SIGUSR1', this._handleUsr1);
    process.removeListener('SIGUSR2', this._handleUsr2);
    return this;
};

KProfiler.prototype._checkIfBusy = function _checkIfBusy( signal ) {
    if (this.isBusy) {
        this.emit('busy');
        this.log("%s: still busy, cannot start/stop a profile now", signal);
        return true;
    }
}

KProfiler.prototype._exportProfile = function _exportProfile( profile, profileName, profileFilename, callback ) {
    var self = this;
    try {
        profile.export()
            .pipe(fs.createWriteStream(profileFilename))
            .on('error', function(err) {
                self.log("%s -- k-profiler: unable to save " + profileName + ":", err.stack);
                profile.delete();
                self.emit('error', err);
                callback(err);
            })
            .on('finish', function() {
                self.log("saved " + profileName + " to %s", profileFilename);
                profile.delete();
                self.emit('finish', profileFilename);
                callback();
            });
    }
    catch (err) {
        this.log("error saving profile: %s", err.stack);
    }
}

// optimize access:  assigning prototype converts the assigned hash to struct
KProfiler.prototype = KProfiler.prototype;

// export a singleton with the signal listeners already installed
var singleton = new KProfiler().install();
module.exports = singleton;
