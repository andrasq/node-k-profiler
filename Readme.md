k-profiler
==========

Thin wrapper around [v8-profiler](https://npmjs.org/package/v8-profiler) to make it
no-code-needed convenient like [heapdump](https://npmjs.org/package/heapdump).

Summary:

    require('@kinvey/profiler');

K-profiler installs handlers for SIGUSR1 and SIGUSR2, causing the app to toggle
execution trace capture on the USR1 signal, and to save a heap snapshot on the USR2
signal.  The files are plain-text json format.

To tell the app to capture an execution trace, send it a SIGUSR1 to start the
trace, and another SIGUSR1 to stop the trace and write the results.

    # first signal starts an execution trace, the second signal saves it to file
    $ kill -USR1 $pid ; sleep 2 ; kill -USR1 $pid

To tell the app to capture a heap snapshot, send it a SIGUSR2 signal.

    # a USR2 signal captures a heap snapshot
    $ kill -USR2 $pid


Files
-----

Execution traces are named eg `v8profile-2016-11-21T18:21:41.345Z-cpuprofile`.
Heap snapshots are named eg `heapdump-2016-11-21T18:21:41.345Z-heapsnapshot`.
Files are created in the app working directory.

Traces and snapshots can be viewed in v8-based browsers (Chrome, Opera, Chromium)
by loading them with `Profiles : Load` under `Tools : More Tools :  Developer
Tools`.


Api
---

Including `@kinvey/profiler` automatically installs signal handlers for SIGUSR1 and
SIGUSR2 to capture execution traces and heap snapshots, respectively.

    var kprofiler = require('@kinvey/profiler');

### profiler.install( )

Respond to SIGUSR1 and SIGUSR2 events by writing process traces or heap snapshots,
respectively.  The signal handlers are installed automatically when `@kinvey/profiler` is
included.  Use `uninstall()` to not respond to signals.

### profiler.uninstall( )

Do not respond to signals, let the system handle SIGUSR2 events as it normally
does.  Note that the default action on an uncaught signal is to exit.  Use `install()`
to respond to signals again.

### profiler.configure( options )

Adjust the built-in settings.

Options:
- `outputDir` - directory where to place the output, default `''` the process
  current working directory

### profiler.verbose( [yesno] )

Turn off/on the k-profiler console.log tracers that track profiling actions.
Tracers are enabled by default.  `verbose()` without an argument returns the current
setting.  The output is like

    2016-11-23T17:39:05.423Z -- k-profiler: capturing heap snapshot
    2016-11-23T17:39:05.532Z -- k-profiler: saved heap snapshot to heapdump-2016-11-23T17:39:05.423Z.heapsnapshot

### Events

`kprofiler` emits events, useful for testing and feedback:

- `'busy'` - sent if a SIGUSR1 or SIGUSR2 is received while busy saving a file
  and unable to write a new trace.  Returns the signal name.
- `'finish'` - emitted whenever finished saving a file. Returns the filename.
- `'signal'` - emitted to confirm receiving a SIGUSR1 or SIGUSR2 signal.
  Returns the signal name.


Related Work
------------

- [qrusage](https://npmjs.org/package/qrusage) - fast `getrusage(2)` bindigs to report cpu usage
- [heapdump](https://npmjs.org/package/heapdump) - save heap snapshots on SIGUSR2
- [v8-profiler](https://npmjs.org/package/v8-profiler) - v8 execution profiler
- [@risingstack/v8-profiler](https://npmjs.org/package/@risingstack/v8-profiler) - fork
- [v8-profiler-node8]https://npmjs.com/package/v8-profiler-node8() - fork
- [node-oom-heapdump](https://www.npmjs.com/package/node-oom-heapdump) - fork
