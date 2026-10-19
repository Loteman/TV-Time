/* ---------- CHANNEL DATA ----------
   `url` is the broadcaster's page, shown in an iframe. `stream` is a direct
   stream that plays in our own player: HLS (.m3u8) or a plain audio stream
   such as MP3 radio. Streams are the broadcasters' own public addresses, as
   their official sites' players use them or as listed by the iptv-org
   project.
   A channel has at least one of them: with both, the stream plays first and
   the page is the fallback and a manual option; stream-only channels have no
   page to fall back to. `label` overrides the avatar text - for a radio
   station, its FM frequency (a national one's in the Tel Aviv area; they
   vary by region).
   Within each category (`group` - the rows, in this order) channels go by
   their channel number - a radio station by its frequency; those without
   one come last. */
const TV_CHANNELS = [
  /* Main channels */
  {id:'kan11', name:'כאן 11', group:'ערוצים מרכזיים', color:'#2f6fed', remoteNumber:11,
   url:'https://www.kan.org.il/live/',
   stream:'https://kancdn.medonecdn.net/livehls/oil/kancdn-live/live/kan11/live.livx/playlist.m3u8'},
  {id:'keshet12', name:'קשת 12', group:'ערוצים מרכזיים', color:'#0aa3a3', remoteNumber:12,
   url:'https://www.mako.co.il/mako-vod-live-tv/VOD-6540b8dcb64fd31006.htm?partner=headerNav'},
  {id:'reshet13', name:'רשת 13', group:'ערוצים מרכזיים', color:'#dc6f1a', remoteNumber:13,
   url:'https://reshet.tv/live/',
   stream:'https://d2xg1g9o5vns8m.cloudfront.net/out/v1/0855d703f7d5436fae6a9c7ce8ca5075/index.m3u8'},
  {id:'ch14', name:'ערוץ 14', group:'ערוצים מרכזיים', color:'#7a4fdc', remoteNumber:14,
   url:'https://www.c14.co.il/live?t=1',
   stream:'https://r.il.cdn-redge.media/livehls/oil/ch14/live/ch14/live.livx/playlist.m3u8'},
  {id:'ch16', name:'ערוץ 16', group:'ערוצים מרכזיים', color:'#4f7fc9', remoteNumber:16,
   url:'https://www.ch16.co.il/',
   stream:'https://ch16israel-cdn.encoders.immergo.tv/2/streamPlaylist.m3u8'},

  /* News and current affairs */
  {id:'ch10', name:'הכלכלה 10', group:'חדשות ואקטואליה', color:'#e0555f', remoteNumber:10,
   url:'https://tv10.co.il/live/'},
  {id:'i24news', name:'i24News', group:'חדשות ואקטואליה', color:'#c94f4f', remoteNumber:15,
   url:'https://video.i24news.tv/player/channel/69b17e029abd89c807678067',
   stream:'https://i24newshebrew-cdn.encoders.immergo.tv/master.m3u8'},
  {id:'hidabroot', name:'הידברות', group:'חדשות ואקטואליה', color:'#4f9ddc', remoteNumber:97,
   stream:'https://cdn.cybercdn.live/HidabrootIL/Live97/playlist.m3u8'},
  {id:'knesset99', name:'כנסת 99', group:'חדשות ואקטואליה', color:'#6f9c4f', remoteNumber:99,
   url:'https://www.knesset.tv/live/',
   stream:'https://contact.gostreaming.tv/Knesset/myStream/playlist.m3u8'},  // only live during sessions

  /* Kids */
  {id:'chinuchit', name:'כאן החינוכית', group:'ילדים', color:'#2f6fed', remoteNumber:80,
   url:'https://www.kan.org.il/live/?stationId=4471#',
   stream:'https://kancdn.medonecdn.net/livehls/oil/kancdn-live/live/kan_edu/live.livx/playlist.m3u8?renditions&fmp4'},

  /* Culture, entertainment and music */
  {id:'ch24', name:'ערוץ 24', group:'תרבות, בידור ומוזיקה', color:'#1c8c5b', remoteNumber:24,
   url:'https://www.mako.co.il/mako-vod-live-tv/VOD-b3480d2eff3fd31006.htm?sCh=3377c13070733210&pId=935020712'},

  /* Other languages */
  {id:'ch9', name:'ערוץ 9', group:'בשפות אחרות', color:'#3f8fd8', remoteNumber:9,
   stream:'https://contact.gostreaming.tv/Con-11/index.m3u8'},
  {id:'makan33', name:'مكان 33', group:'בשפות אחרות', color:'#b08a2e', remoteNumber:33,
   url:'https://www.kan.org.il/live/?stationId=4532#',
   stream:'https://kancdn.medonecdn.net/livehls/oil/kancdn-live/live/makan/live.livx/playlist.m3u8'},
  {id:'i24en', name:'i24News English', group:'בשפות אחרות', color:'#c94f4f', label:'EN',
   stream:'https://i24newsenglish-cdn.encoders.immergo.tv/master.m3u8'},
  {id:'i24fr', name:'i24News Français', group:'בשפות אחרות', color:'#c94f4f', label:'FR',
   stream:'https://i24newsfrench-cdn.encoders.immergo.tv/master.m3u8'},
  {id:'i24ar', name:'i24News عربي', group:'בשפות אחרות', color:'#c94f4f', label:'AR',
   stream:'https://i24newsarabic-cdn.encoders.immergo.tv/master.m3u8'},
  {id:'halatv', name:'הלא TV', group:'בשפות אחרות', color:'#dc8a4f',
   stream:'https://stream.panet.com/edge/halaTV/playlist.m3u8'},  // not 24/7
];

const RADIO_CHANNELS = [
  /* Galei Tzahal (IDF radio) - national */
  {id:'galgalatz', name:'גלגל"צ', group:'רדיו ארצי - גלי צה"ל', color:'#4fc3dc', label:'91.8',
   url:'https://glz.co.il/%D7%92%D7%9C%D7%92%D7%9C%D7%A6/',
   stream:'https://glzwizzlv.bynetcdn.com/glglz_mp3?awCollectionId=misc&awEpisodeId=glglz'},
  {id:'galatz', name:'גל"צ', group:'רדיו ארצי - גלי צה"ל', color:'#2f9ddc', label:'96.6',
   url:'https://glz.co.il/%D7%92%D7%9C%D7%A6/',
   stream:'https://api.bynetcdn.com/Redirector/glz/glz/ICE-LIVE?tn=&ts=1484121989'},

  /* Israeli Public Broadcasting Corporation (Kan) - national */
  {id:'kan88', name:'כאן 88', group:'רדיו תאגיד השידור (כאן)', color:'#7a4fdc', label:'88',
   url:'https://www.kan.org.il/live/?stationId=4504#',
   stream:'https://kancdn.medonecdn.net/livehls/oil/kancdn-live/live/radio/kan_88/live.livx/playlist.m3u8?renditions'},
  {id:'kanmorasha', name:'כאן מורשת', group:'רדיו תאגיד השידור (כאן)', color:'#dc8a1a', label:'90.8',
   url:'https://www.kan.org.il/live/?stationId=4511#',
   stream:'https://kancdn.medonecdn.net/livehls/oil/kancdn-live/live/radio/kan_moreshet/live.livx/playlist.m3u8?renditions'},
  {id:'reshetbet', name:'כאן ב׳', group:'רדיו תאגיד השידור (כאן)', color:'#e0555f', label:'95',
   url:'https://www.kan.org.il/live/?stationId=4483#',
   stream:'https://kancdn.medonecdn.net/livehls/oil/kancdn-live/live/radio/kan_reshet_bet/live.livx/playlist.m3u8?renditions'},
  {id:'kanmusic', name:'כאן קול המוסיקה', group:'רדיו תאגיד השידור (כאן)', color:'#e05fa0', label:'97.2',
   url:'https://www.kan.org.il/live/?stationId=4518#',
   stream:'https://kancdn.medonecdn.net/livehls/oil/kancdn-live/live/radio/kan_kol_hamuzika/live.livx/playlist.m3u8?renditions'},
  {id:'kangimel', name:'כאן גימל', group:'רדיו תאגיד השידור (כאן)', color:'#dc6f1a', label:'97.8',
   url:'https://www.kan.org.il/live/?stationId=4490#',
   stream:'https://kancdn.medonecdn.net/livehls/oil/kancdn-live/live/radio/kan_gimel/live.livx/playlist.m3u8?renditions'},
  {id:'kanreka', name:'כאן רק"ע', group:'רדיו תאגיד השידור (כאן)', color:'#b08a2e', label:'101.3',
   url:'https://www.kan.org.il/live/?stationId=4525#',
   stream:'https://kancdn.medonecdn.net/livehls/oil/kancdn-live/live/radio/kan_reka/live.livx/playlist.m3u8?renditions'},
  {id:'kantarbut', name:'כאן תרבות', group:'רדיו תאגיד השידור (כאן)', color:'#1c8c5b', label:'104.9',
   url:'https://www.kan.org.il/live/?stationId=4497#',
   stream:'https://kancdn.medonecdn.net/livehls/oil/kancdn-live/live/radio/kan_tarbut/live.livx/playlist.m3u8?renditions'},
  {id:'kanarabic', name:'רדיו מכאן', group:'רדיו תאגיד השידור (כאן)', color:'#4fb0dc', label:'مكان',
   url:'https://www.kan.org.il/live/?stationId=358568#',
   stream:'https://kancdn.medonecdn.net/livehls/oil/kancdn-live/live/radio/radio_makan/live.livx/playlist.m3u8?renditions'},

  /* News and talk stations */
  {id:'kolbarama', name:'קול ברמה', group:'רדיו חדשות', color:'#8a6fdc', label:'92.1',
   url:'https://kol-barama.co.il/live/',
   stream:'https://cdn.cybercdn.live/Kol_Barama/Live_Audio/icecast.audio'},
  {id:'kolchai', name:'קול חי', group:'רדיו חדשות', color:'#4f9ddc', label:'93',
   url:'https://www.emess.co.il/live/',
   stream:'https://live.kcm.fm/live-new/hls.m3u8'},
  {id:'galeyisrael', name:'גלי ישראל', group:'רדיו חדשות', color:'#5b8fdc', label:'94',
   url:'https://www.gly.co.il/',
   stream:'https://cdn.cybercdn.live/Galei_Israel/Live/icecast.audio'},
  {id:'radiodarom', name:'רדיו דרום', group:'רדיו חדשות', color:'#dc8a4f', label:'97',
   url:'https://www.radiodarom.co.il/',
   stream:'https://cdn.cybercdn.live/Darom_97FM/Live/icecast.audio'},
  {id:'radiojerusalem', name:'רדיו ירושלים', group:'רדיו חדשות', color:'#9c4fdc', label:'101',
   url:'https://www.jerusalemnet.co.il/',
   stream:'https://radio.streamgates.net/stream/101fm'},
  {id:'radiotelaviv', name:'רדיו תל אביב', group:'רדיו חדשות', color:'#e04f4f', label:'102',
   url:'https://www.102fm.co.il/',
   stream:'https://102.livecdn.biz/102fm_aac'},
  {id:'fm103', name:'103FM', group:'רדיו חדשות', color:'#e0457b', label:'103',
   url:'https://103fm.maariv.co.il/',
   stream:'https://cdn.cybercdn.live/103FM/Live/icecast.audio'},
  {id:'radiotzafon', name:'רדיו צפון', group:'רדיו חדשות', color:'#6f9c4f', label:'104.5',
   url:'https://1045fm.maariv.co.il/',
   stream:'https://cdn.cybercdn.live/Tzafon_NonStop/Live_Audio/icecast.audio'},

  /* Music stations */
  {id:'levhamedina', name:'רדיו לב המדינה', group:'רדיו מוזיקה', color:'#4fdc8a', label:'91',
   url:'https://www.91fm.co.il/',
   stream:'https://cdn.cybercdn.live/Lev_Hamedina/Audio/icecast.audio'},
  {id:'kolrega', name:'רדיו קול רגע', group:'רדיו מוזיקה', color:'#dcb04f', label:'96',
   url:'https://96fm.co.il/',
   stream:'https://cdn.cybercdn.live/Kol_Rega/Live_Audio/icecast.audio'},
  {id:'eco99', name:'אקו 99', group:'רדיו מוזיקה', color:'#3fbf8f', label:'99',
   url:'https://eco99fm.maariv.co.il/live-radio',
   stream:'https://99.mediacast.co.il/99fm_aac'},
  {id:'radius', name:'רדיוס', group:'רדיו מוזיקה', color:'#dc4f4f', label:'100',
   url:'https://www.100fm.co.il/',
   stream:'https://cdn.cybercdn.live/Radios_100FM/Audio/icecast.audio'},
  {id:'kolchaimusic', name:'קול חי מיוזיק', group:'רדיו מוזיקה', color:'#4fdcc7', label:'102.5',
   url:'https://kcm.fm/',
   stream:'https://live.kcm.fm/livemusic/hls.m3u8'},
  {id:'kolplay', name:'קול פליי', group:'רדיו מוזיקה', color:'#dc6fa0', label:'107.6',
   url:'https://kol-play.co.il/',
   stream:'https://cdn.cybercdn.live/Kol_Barama/Music/icecast.audio'},
  {id:'radiusnostalgia', name:'רדיוס נוסטלגי', group:'רדיו מוזיקה', color:'#a3743f',
   url:'https://digital.100fm.co.il/',
   stream:'https://gb25.streamgates.net/radios-audio/100Nostalgia/icecast.audio'},
];
