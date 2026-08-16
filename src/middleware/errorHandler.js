// Stack traces (file paths, dependency internals, query details) go to the
// server log only, never the response — this was previously conditional on
// NODE_ENV === 'development', but Railway wasn't actually setting NODE_ENV
// to 'production', so every real error was leaking its full stack straight
// to the client. Not worth relying on an env var being set correctly
// somewhere else; API responses just never carry this, full stop.
module.exports = (err, req, res, next) => {
    console.error('[ERROR]', err.stack || err.message);

    const status = err.statusCode || 500;
    res.status(status).json({
      message: err.message || 'Internal server error'
    });
  };