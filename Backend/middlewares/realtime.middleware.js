// Backend/middlewares/realtime.middleware.js
export const requireServiceToken = (req, res, next) => {
  const headerToken = req.headers['x-service-token'];
  const envToken = process.env.REALTIME_SERVICE_TOKEN;

  console.log('--- REALTIME TOKEN DEBUG ---');
  console.log('Header token:', headerToken);
  console.log('Env token   :', envToken);
  console.log('Match?      :', headerToken === envToken);
  console.log('IP:', req.ip);
  console.log('--------------------------------');

  if (!headerToken || headerToken !== envToken) {
    console.warn(`[Security] Unauthorized service access attempt from ${req.ip}`);
    return res.status(403).json({ message: 'Forbidden: Invalid Service Token' });
  }

  next();
};
