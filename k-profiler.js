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

var lastProfileSignalTime = 0           // detect back-to-back SIGUSR2 signals
var isProfiling = false                 // set when gathering execution profile data
var isBusy = false                      // set when busy saving profile
var startProfiler = null                // execution profile capture start timer

/*
 * use v8-profiler to capture an execution profile on a single SIGUSR2 signal,
 * or save a heap snapshot on two back-to-back USR2 signals
 */
process.on('SIGUSR2', function() {
    var now = Date.now();

    if (isBusy) {
        console.log("%s -- k-profiler: still busy, cannot start/stop a profile now", new Date().toISOString());
        return;
    }

    if (isProfiling) {
        // save the execution profile currently being captured
        isBusy = true;
        var profile = v8profiler.stopProfiling('');
        startProfiler = null;
        isProfiling = false;
        if (!profile) {
            console.log("%s -- k-profiler: unable to obtain execution profile", new Date().toISOString());
            return;
        }

        var profileFilename = 'v8profile-' + new Date().toISOString() + '.cpuprofile';
        profile.export()
            .pipe(fs.createWriteStream(profileFilename))
            .on('error', function(err) {
                console.log("%s -- k-profiler: unable to save execution profile:", err.stack);
                profile.delete();
                isBusy = false;
            })
            .on('finish', function() {
                console.log("%s -- k-profiler: saved execution profile to %s", new Date().toISOString(), profileFilename);
                profile.delete();
                isBusy = false;
            });
    }
    else {
        // unless another signal arrives soon, start capturing the execution profile
        if (!startProfiler) {
            startProfiler = setTimeout(function() {
                console.log("%s -- k-profiler: capturing execution profile", new Date().toISOString());
                v8profiler.startProfiling('', true);
                isProfiling = true;
            }, 200);
        }

        // on two signals back-to-back save a heap snapshot
        // Note: this is a blocking operation proportional to heap size, use with care.
        if (now < lastProfileSignalTime + 200) {
            if (startProfiler) {
                clearTimeout(startProfiler);
                startProfiler = null;
            }
            console.log("%s -- k-profiler: capturing heap snapshot", new Date().toISOString());

            isBusy = true;
            var profile = v8profiler.takeSnapshot();
            var profileFilename = 'heapdump-' + new Date(now).toISOString() + '.heapsnapshot';
            profile.export()
                .pipe(fs.createWriteStream(profileFilename))
                .on('error', function(err) {
                    console.log("%s -- k-profiler: unable to save heap snapshot:", err.stack);
                    profile.delete();
                    isBusy = false;
                })
                .on('finish', function() {
                    console.log("%s -- k-profiler: saved heap snapshot to %s", new Date().toISOString(), profileFilename);
                    profile.delete();
                    isBusy = false;
                });
        }
        else {
            lastProfileSignalTime = now;
        }
    }
})
