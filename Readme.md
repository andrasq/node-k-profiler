k-profiler
==========

Thin wrapper around [v8-profiler](https://npmjs.org/package/v8-profiler) to make it
no-code-needed convenient like [heapdump](https://npmjs.org/package/heapdump).

Summary:

    require('k-profiler')

K-profiler installs a signal handler for SIGUSR2, causing the app to toggle
execution trace capture on a single USR2 signal, and to save a heap snapshot on two
back-to-back USR2 signals.  The files are plain-text json format.

To tell the app to capture an execution trace, send it a SIGUSR2 to start the
trace, and another SIGUSR2 to stop the trace and write the results.

    # one signal starts an execution trace, a second signal saves it to file
    $ kill -USR2 $pid ; sleep 2 ; kill -USR2 $pid

To tell the app to capture a heap snapshot, sent it two back-to-back SIGUSR2 signals.

    # two back-to-back signals capture a heap trace
    $ kill -USR2 $pid ; kill -USR2 $pid ; 


Files
-----

Execution traces are named eg `v8profile-2016-11-21T18:21:41.345Z-cpuprofile`.
Heap snapshots are named eg `heapdump-2016-11-21T18:21:41.345Z-heapsnapshot`.
Files are placed into the app working directory.

Traces and snapshots can be viewed with Chrome or Opera by loading them with
Profiles : Load under Tools : More Tools : Developer Tools.


Related Work
------------

- [qrusage](https://npmjs.org/package/qrusage) - fast `getrusage(2)` bindigs to report cpu usage
- [heapdump](https://npmjs.org/package/heapdump) _ save heap snapshots on SIGUSR2
- [v8-profiler](https://npmjs.org/package/v8-profiler) - v8 execution profiler
