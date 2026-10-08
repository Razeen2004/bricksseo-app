export default async function rawBodyPlugin(fastify, opts) {
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    function (req, body, done) {
      try {
        const json = JSON.parse(body.toString());
        // Attach the raw buffer to the request object so we can use it for HMAC verification
        req.rawBody = body;
        done(null, json);
      } catch (err) {
        err.statusCode = 400;
        done(err, undefined);
      }
    }
  );
}
