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
    this.lastProfileSignalTime = 0;     // detect back-to-back SIGUSR2 signals
    this.isProfiling = false;           // set when gathering execution profile data
    this.isBusy = false;                // set when busy saving profile
    this.startProfiler = null;          // execution profile capture start timer
    this._handler = null;
}
util.inherits(KProfiler, events.EventEmitter);

KProfiler.prototype.onSignal = function onSignal() {
    var self = this;
    var now = Date.now();

    if (this.isBusy) {
        console.log("%s -- k-profiler: still busy, cannot start/stop a profile now", new Date().toISOString());
        return;
    }

    if (this.isProfiling) {
        // save the execution profile currently being captured
        this.isBusy = true;
        var profile = v8profiler.stopProfiling('');
        this.startProfiler = null;
        this.isProfiling = false;
        if (!profile) {
            console.log("%s -- k-profiler: unable to obtain execution profile", new Date().toISOString());
            return;
        }

        var profileFilename = 'v8profile-' + new Date().toISOString() + '.cpuprofile';
        this._exportProfile(profile, 'execution profile', profileFilename);
    }
    else {
        // unless another signal arrives soon, start capturing the execution profile
        if (!this.startProfiler) {
            this.startProfiler = setTimeout(function() {
                console.log("%s -- k-profiler: capturing execution profile", new Date().toISOString());
                v8profiler.startProfiling('', true);
                self.isProfiling = true;
            }, 200);
        }

        // on two signals back-to-back save a heap snapshot
        // Note: this is a blocking operation proportional to heap size, use with care.
        if (now < this.lastProfileSignalTime + 200) {
            if (this.startProfiler) {
                clearTimeout(this.startProfiler);
                this.startProfiler = null;
            }
            console.log("%s -- k-profiler: capturing heap snapshot", new Date().toISOString());

            this.isBusy = true;
            var profile = v8profiler.takeSnapshot();
            var profileFilename = 'heapdump-' + new Date(now).toISOString() + '.heapsnapshot';
            this._exportProfile(profile, 'heap snapshot', profileFilename);
        }
        else {
            this.lastProfileSignalTime = now;
        }
    }
}

KProfiler.prototype.install = function install() {
    this._handler = this.onSignal.bind(this);
    process.on('SIGUSR2', this._handler);
    return this;
};

KProfiler.prototype.uninstall = function uninstall() {
    process.removeListener('SIGUSR2', this._handler);
    return this;
};

KProfiler.prototype._exportProfile = function exportProfile( profile, profileName, profileFilename, maybeCallback ) {
    var self = this;
    profile.export()
        .pipe(fs.createWriteStream(profileFilename))
        .on('error', function(err) {
            console.log("%s -- k-profiler: unable to save " + profileName + ":", err.stack);
            profile.delete();
            self.isBusy = false;
            self.emit('error', err);
            if (maybeCallback) maybeCallback(err);
        })
        .on('finish', function() {
            console.log("%s -- k-profiler: saved " + profileName + " to %s", new Date().toISOString(), profileFilename);
            profile.delete();
            self.isBusy = false;
            self.emit('finish', profileFilename);
            if (maybeCallback) maybeCallback();
        });
}


// export a singleton with the signal listener installed
var singleton = new KProfiler().install();
module.exports = singleton;
