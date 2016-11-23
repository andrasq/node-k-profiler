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

    it ('should capture an execution trace', function(done) {
        var before = new Date().toISOString();
        process.kill(process.pid, 'SIGUSR2');
        setTimeout(function() {
            process.kill(process.pid, 'SIGUSR2');
            profiler.once('finish', function(filename) {
                var after = new Date().toISOString();
                var newFiles = findNewFiles(before, after);
                assert.equal(newFiles.length, 1);
                assert.equal(newFiles[0], filename);
                fs.unlinkSync(newFiles[0]);
                done();
            })
        }, profiler.maxSignalDelay + 5)
    })

    it ('should capture a heap snapshot', function(done) {
        var before = new Date().toISOString();
        process.kill(process.pid, 'SIGUSR2');
        process.kill(process.pid, 'SIGUSR2');
        profiler.once('finish', function(filename) {
            var after = new Date().toISOString();
            var newFiles = findNewFiles(before, after);
            assert.equal(newFiles.length, 1);
            assert.equal(newFiles[0], filename);
            assert.ok(newFiles[0].match(/^heapdump-.*\.heapsnapshot/));
            fs.unlinkSync(newFiles[0]);
            done();
        })
    })

    it ('should not create files if uninstalled', function(done) {
        // listen for the signal else process exits
        process.on('SIGUSR2', function(){});

        // listen for the first created file
        function onFinish() { done(new Error("finish should not have been called")) }
        profiler.once('finish', onFinish);

        // ask for a heap snapshot
        profiler.uninstall();
        process.kill(process.pid, 'SIGUSR2');
        process.kill(process.pid, 'SIGUSR2');

        // the test snapshot should take under .2 seconds, but wait a little extra
        setTimeout(function() {
            profiler.removeListener('finish', onFinish);
            profiler.install();
            done();
        }, 250);
    })

    describe ('edge cases', function() {

        it ('should ignore signal during heap snapshot save', function(done) {
            var before = new Date().toISOString();
            process.kill(process.pid, 'SIGUSR2');
            process.kill(process.pid, 'SIGUSR2');
            process.kill(process.pid, 'SIGUSR2');
            process.kill(process.pid, 'SIGUSR2');
            profiler.once('finish', function(filename) {
                var after = new Date().toISOString();
                var newFiles = findNewFiles(before, after);
                assert.equal(newFiles.length, 1);
                assert.equal(newFiles[0], filename);
                assert.ok(newFiles[0].match(/^heapdump/));
                fs.unlinkSync(newFiles[0]);
                done();
            })
        })

        it ('should halt execution trace on back-to-back signals', function(done) {
            var before = new Date().toISOString();
            process.kill(process.pid, 'SIGUSR2');
            setTimeout(function() {
                // the first set of back-to-back signals should halt the execution trace
                process.kill(process.pid, 'SIGUSR2');
                process.kill(process.pid, 'SIGUSR2');
                profiler.once('finish', function(filename) {
                    // should halt the execution trace
                    assert.ok(filename.match(/^v8profile/));

                    // a second set of back-to-back signals should save a heap snapshot
                    process.kill(process.pid, 'SIGUSR2');
                    process.kill(process.pid, 'SIGUSR2');
                    profiler.once('finish', function(filename) {
                        var after = new Date().toISOString();
                        var newFiles = findNewFiles(before, after);
                        assert.equal(newFiles.length, 2);
                        // newFiles are returned in create-time order
                        assert.ok(newFiles[0].match(/^v8profile/));
                        assert.ok(newFiles[1].match(/^heapdump/));
                        fs.unlinkSync(newFiles[0]);
                        fs.unlinkSync(newFiles[1]);
                        done();
                    });
                })
            }, profiler.maxSignalDelay + 5);
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
