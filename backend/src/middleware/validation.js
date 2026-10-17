export function validate({ body, query, params } = {}) {
  return async (req, _res, next) => {
    try {
      if (body) {
        req.body = await body.parseAsync(req.body);
      }
      if (query) {
        req.query = await query.parseAsync(req.query);
      }
      if (params) {
        req.params = await params.parseAsync(req.params);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export default validate;
