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

var assert = require('assert');
var fs = require('fs');
var events = require('events');
var profiler = require('./');


describe ('k-profiler', function() {

    it ('should return a KProfiler object', function(done) {
        assert.equal(profiler.constructor.name, 'KProfiler');
        done();
    })

    it ('should be an event emitter', function(done) {
        assert.ok(profiler instanceof events.EventEmitter);
        done();
    })

    it ('should return current verbosity setting', function(done) {
        assert.strictEqual(profiler.verbose(), true);
        done();
    })

    it ('should change verbosity setting', function(done) {
        profiler.verbose(0);
        assert.strictEqual(profiler.verbose(), false);
        profiler.verbose("yes");
        assert.strictEqual(profiler.verbose(), true);
        done();
    })

    it ('should capture an execution trace', function(done) {
        var onSignalSignal = false;
        profiler.once('signal', function(signal){ onSignalSignal = signal });
        var onFinishFilename = false;
        profiler.once('finish', function(filename){ onFinishFilename = filename });

        process.kill(process.pid, 'SIGUSR1');

        var before = new Date().toISOString();
        setTimeout(function() {
            process.kill(process.pid, 'SIGUSR1');
            profiler.once('finish', function() {
                var after = new Date().toISOString();
                assert.equal(onSignalSignal, 'SIGUSR1');
                var newFiles = findNewFiles(before, after);
                assert.equal(newFiles.length, 1);
                assert.equal(newFiles[0], onFinishFilename);
                fs.unlinkSync(newFiles[0]);
                done();
            })
        }, profiler.maxSignalDelay + 5)
    })

    it ('should capture a heap snapshot', function(done) {
        var onSignalSignal = false;
        profiler.once('signal', function(signal){ onSignalSignal = signal });
        var onFinishFilename = false;
        profiler.once('finish', function(filename){ onFinishFilename = filename });

        process.kill(process.pid, 'SIGUSR2');

        var before = new Date().toISOString();
        profiler.once('finish', function() {
            var after = new Date().toISOString();
            assert.equal(onSignalSignal, 'SIGUSR2');
            var newFiles = findNewFiles(before, after);
            assert.equal(newFiles.length, 1);
            assert.equal(newFiles[0], onFinishFilename);
            assert.ok(newFiles[0].match(/^heapdump-.*\.heapsnapshot/));
            fs.unlinkSync(newFiles[0]);
            done();
        })
    })

    it ('should not create files if uninstalled', function(done) {
        // install a signal handler else the process exits on USR2
        process.on('SIGUSR2', function(){});

        // listen for confirmation of receipt of the signal
        function onSignal() { done(new Error("should not have received the signal")) }
        profiler.once('signal', onSignal);

        // ask for a heap snapshot
        profiler.uninstall();
        process.kill(process.pid, 'SIGUSR2');

        // a signal is received almost immediately, but wait 1/50th of second
        setTimeout(function() {
            profiler.removeListener('signal', onSignal);
            profiler.install()
            done();
        }, 20);
    })

    describe ('edge cases', function() {

        it ('should ignore signal during heap snapshot save', function(done) {
            var finishCount = 0;
            function onFinish() { finishCount += 1; assert(finishCount < 2) }
            profiler.on('finish', onFinish);

            var busyCount = 0;
            function onBusy() { busyCount += 1; }
            profiler.on('busy', onBusy);

            var before = new Date().toISOString();

            // ask for a trace and another snapshot during a heap snapshot
            process.kill(process.pid, 'SIGUSR2');
            process.kill(process.pid, 'SIGUSR1');
            process.kill(process.pid, 'SIGUSR2');
            profiler.once('finish', function() {
                assert.equal(finishCount, 1);
                assert.equal(busyCount, 2);
                profiler.removeListener('finish', onFinish);
                // wait another 1/4 sec to confirm that no files were created
                setTimeout(function() {
                    var newFiles = findNewFiles(before, after);
                    assert.equal(newFiles.length, 1);
                    assert.ok(newFiles[0].match(/^heapdump/));
                    fs.unlinkSync(newFiles[0]);
                    done();
                }, 250);
            });
        })
    })

})

// find profiler files created between the before and after ISOString timestamps
function findNewFiles( before, after ) {
    var newFiles;

    // find all our profile files
    newFiles = fs.readdirSync(process.cwd()).filter(function(filename) {
        if (/^v8profile/.test(filename)) {
            return filename >= ('v8profile-' + before + '.json') && filename <= ('v8profile-' + after + '.json');
        }
        if (/^heapdump/.test(filename)) {
            return filename >= ('heapdump-' + before + '.heapsnapshot') && filename <= ('heapdump-' + after + '.heapsnapshot');
        }
    })

    // sort files into create-time order
    newFiles.sort(function(f1, f2) {
        var m1 = f1.match(/^[a-z0-9]*-(.*)\.[a-z]*$/);
        var m2 = f2.match(/^[a-z0-9]*-(.*)\.[a-z]*$/);
        if (m1 && m2) return m1[1] <= m2[1] ? -1 : 1;
    });

    return newFiles;
}

// wait for the file size to stop growing
function waitForWrite(filename, callback) {
    var filesize = fs.statSync(filename).size || -1;
    function waitLoop() {
        var stat = fs.statSync(filename);
        if (stat.size == filesize) {
            // wait a bit longer for the busy flag to be cleared
            setTimeout(callback, 50);
            return;
        }
        filesize = stat.size;
        setTimeout(waitLoop, 50);
    }
    waitLoop();
}
