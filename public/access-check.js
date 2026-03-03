/**
 * Churchill Falls Information Assistant — Access Control
 * 
 * Add to every page: <script src="access-check.js"></script>
 * Place as the FIRST script in <body>.
 *
 * Testing links:
 *   churchillfalls.info?token=test2026
 *   churchillfalls.info?token=dougmay
 *   churchillfalls.info?token=review
 *
 * Admin (never expires):
 *   churchillfalls.info?token=lillian
 *
 * To disable access control entirely, delete this file
 * and remove the <script> tags from each page.
 */
(function() {
  // ---- CONFIGURATION ----
  var EXPIRY = new Date('2026-03-01T05:00:00Z'); // Feb 28 midnight ET = Mar 1 05:00 UTC
  var TESTER_TOKENS = ['test2026', 'dougmay', 'review'];
  var ADMIN_TOKENS = ['lillian']; // Never expire
  // ---- END CONFIGURATION ----

  var params = new URLSearchParams(window.location.search);
  var token = params.get('token');

  // Store token in sessionStorage so internal navigation works
  // (clicking About, Sources, etc. won't lose the token)
  if (token) {
    sessionStorage.setItem('cf_access_token', token);
  } else {
    token = sessionStorage.getItem('cf_access_token');
  }

  // Admin tokens — always allowed
  if (token && ADMIN_TOKENS.indexOf(token) !== -1) {
    return; // Access granted, no expiry check
  }

  // No token at all
  if (!token || (TESTER_TOKENS.indexOf(token) === -1 && ADMIN_TOKENS.indexOf(token) === -1)) {
    blockAccess('This site is currently in private testing.<br>Please use your invitation link to access.');
    return;
  }

  // Valid tester token but expired
  if (new Date() > EXPIRY) {
    blockAccess('This testing link has expired.<br>Please contact us for continued access.');
    return;
  }

  // Access granted

  function blockAccess(message) {
    document.documentElement.innerHTML = 
      '<html><head><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>' +
      '<body style="background:#1a1a1a;color:#a8a8a8;display:flex;align-items:center;' +
      'justify-content:center;height:100vh;font-family:-apple-system,BlinkMacSystemFont,' +
      'sans-serif;text-align:center;padding:24px;">' +
      '<div><h2 style="color:#5eead4;margin-bottom:12px;">Churchill Falls Information Assistant</h2>' +
      '<p style="line-height:1.6;">' + message + '</p></div></body></html>';
  }
})();