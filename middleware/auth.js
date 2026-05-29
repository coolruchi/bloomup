// Require user to be logged in
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  res.redirect('/auth/login');
}

// Require admin role
function requireAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.userRole === 'admin') {
    return next();
  }
  if (!req.session || !req.session.userId) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/login');
  }
  res.status(403).render('pages/error', {
    title: 'Access Denied',
    message: 'You do not have permission to access this page.',
    code: 403
  });
}

// Attach user to res.locals for all views
function attachUser(req, res, next) {
  res.locals.user = req.session.userId ? {
    id: req.session.userId,
    email: req.session.userEmail,
    name: req.session.userName,
    role: req.session.userRole
  } : null;
  res.locals.currentPath = req.path;
  next();
}

module.exports = { requireAuth, requireAdmin, attachUser };
