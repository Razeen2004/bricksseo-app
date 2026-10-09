import fp from 'fastify-plugin';

// Wrapped in fastify-plugin so the parser applies app-wide; otherwise Fastify
// encapsulates it and the webhook route never receives request.rawBody.
export default fp(async function rawBodyPlugin(fastify) {
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    function (req, body, done) {
      try {
        const json = body.length ? JSON.parse(body.toString()) : {};
        // Attach the raw buffer to the request object so we can use it for HMAC verification
        req.rawBody = body;
        done(null, json);
      } catch (err) {
        err.statusCode = 400;
        done(err, undefined);
      }
    }
  );
});
