/* The site's text pages (About, Privacy) - see page.css. */

/* The TV app (see TV_DEVICE in script.js): bigger text, the remote's Back
   key instead of a back button, and up / down scroll the page a good chunk
   at a time - by default a remote press barely moves it. */
if(/ZapZapApp|TVTimeApp/.test(navigator.userAgent) || new URLSearchParams(location.search).has('tv')){
  document.documentElement.classList.add('tv');
  document.addEventListener('keydown', (e) => {
    if(e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    window.scrollBy({top: (e.key === 'ArrowDown' ? 1 : -1) * innerHeight * 0.6, behavior: 'smooth'});
  });
}

// came from the classic view (?old-ui): the way back (and between the
// pages) keeps it
if(new URLSearchParams(location.search).has('old-ui')){
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('a[href="./"], a[data-page]').forEach(a => {
      a.href = a.getAttribute('href') === './' ? './?old-ui' : a.getAttribute('href') + '?old-ui';
    });
  });
}

// the footer's copyright year
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.year').forEach(el => { el.textContent = new Date().getFullYear(); });
});
