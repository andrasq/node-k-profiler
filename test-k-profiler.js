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
            setTimeout(function() {
                var after = new Date().toISOString();
                var newFiles = fs.readdirSync(process.cwd()).filter(function(filename) {
                    if (/^v8profile/.test(filename)) {
                        return filename >= ('v8profile-' + before + '.json') && filename <= ('v8profile-' + after + '.json');
                    }
                });
                assert.equal(newFiles.length, 1);
                waitForWrite(newFiles[0], function() {
                    fs.unlinkSync(newFiles[0]);
                    done();
                })
            }, 100);
        }, 250)
    })

    it ('should capture a heap snapshot', function(done) {
        var before = new Date().toISOString();
        process.kill(process.pid, 'SIGUSR2');
        process.kill(process.pid, 'SIGUSR2');
        setTimeout(function() {
            var after = new Date().toISOString();
            var newFiles = fs.readdirSync(process.cwd()).filter(function(filename) {
                if (/^heapdump/.test(filename)) {
                    return filename >= ('heapdump-' + before + '.heapsnapshot') && filename <= ('heapdump-' + after + '.heapsnapshot');
                }
            });
            assert.equal(newFiles.length, 1);
            waitForWrite(newFiles[0], function() {
                fs.unlinkSync(newFiles[0]);
                done();
            })
        }, 250)
    })

    describe ('edge cases', function() {

        it ('should ignore signal during heap snapshot save', function(done) {
            var before = new Date().toISOString();
            process.kill(process.pid, 'SIGUSR2');
            process.kill(process.pid, 'SIGUSR2');
            process.kill(process.pid, 'SIGUSR2');
            setTimeout(function() {
                var after = new Date().toISOString();
                var newFiles = fs.readdirSync(process.cwd()).filter(function(filename) {
                    if (/^v8profile/.test(filename)) {
                        return filename >= ('v8profile-' + before + '.json') && filename <= ('v8profile-' + after + '.json');
                    }
                    if (/^heapdump/.test(filename)) {
                        return filename >= ('heapdump-' + before + '.heapsnapshot') && filename <= ('heapdump-' + after + '.heapsnapshot');
                    }
                })
                assert.equal(newFiles.length, 1);
                assert.ok(newFiles[0].match(/^heapdump/));
                waitForWrite(newFiles[0], function() {
                    fs.unlinkSync(newFiles[0]);
                    done();
                })
            }, 400);
        })

        it ('should stop execution trace on back-to-back signals heap snapshot request', function(done) {
            var before = new Date().toISOString();
            process.kill(process.pid, 'SIGUSR2');
            setTimeout(function() {
                process.kill(process.pid, 'SIGUSR2');
                process.kill(process.pid, 'SIGUSR2');
                setTimeout(function() {
                    // a second set of back-to-back signals should save a heap snapshot
                    process.kill(process.pid, 'SIGUSR2');
                    process.kill(process.pid, 'SIGUSR2');
                    setTimeout(function() {
                        var after = new Date().toISOString();
                        var newFiles = fs.readdirSync(process.cwd()).filter(function(filename) {
                            if (/^v8profile/.test(filename)) {
                                return filename >= ('v8profile-' + before + '.json') && filename <= ('v8profile-' + after + '.json');
                            }
                            if (/^heapdump/.test(filename)) {
                                return filename >= ('heapdump-' + before + '.heapsnapshot') && filename <= ('heapdump-' + after + '.heapsnapshot');
                            }
                        });
                        newFiles.sort();
                        assert.equal(newFiles.length, 2);
                        assert.ok(newFiles[0].match(/^heapdump/));
                        assert.ok(newFiles[1].match(/^v8profile/));
                        waitForWrite(newFiles[0], function() {
                            waitForWrite(newFiles[1], function() {
                                fs.unlinkSync(newFiles[0]);
                                fs.unlinkSync(newFiles[1]);
                                done();
                            })
                        })
                    }, 400);
                }, 250);
            }, 250);
        })

    })

})
