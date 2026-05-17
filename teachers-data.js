/* Signature Pianos — teacher directory data
   Shared by teachers.html (directory + map), teacher.html (profile),
   and teachers-match.html (quiz results).
   Add/edit entries here; the pages re-render automatically. */

const TEACHERS = [

  {
    id: 'eleanor-chen',
    name: 'Eleanor Chen',
    suburb: 'Carlton',
    coords: [-37.7996, 144.9669],
    experience: 18,
    headline: 'Conservatorium-trained classical specialist preparing AMEB candidates from Grade 4 through LMusA.',
    rate: 95,
    rateLabel: '$95 / 45 min',
    trialOffer: 'Free 20-minute meet-and-play',
    styles: ['Classical', 'AMEB exam prep'],
    studentAges: ['teens', 'adults'],
    formats: ['in-person', 'online'],
    availability: ['weekdays', 'evenings'],
    skillLevels: ['intermediate', 'advanced'],
    languages: ['English', 'Mandarin'],
    credentials: ['Bachelor of Music (Performance) — Melbourne Conservatorium', 'AMEB Examiner since 2019'],
    bio: 'Eleanor has guided more than 40 students through Certificate of Performance and LMusA diplomas. She trained under Stephen McIntyre at the Melbourne Conservatorium and now teaches from a sunlit Carlton studio with a Shigeru Kawai SK-2.',
    philosophy: 'Technique is the vocabulary; interpretation is the sentence. I want students to leave each lesson knowing why a phrase wants to breathe a certain way — not just how to play the notes.',
    studio: 'Home studio, Carlton (Shigeru Kawai SK-2)',
    photo: null,
    accent: '#b8935a',
  },

  {
    id: 'marcus-okafor',
    name: 'Marcus Okafor',
    suburb: 'Fitzroy',
    coords: [-37.7980, 144.9784],
    experience: 12,
    headline: 'Jazz and contemporary teacher — chord voicings, improvisation, lead sheet reading for working musicians.',
    rate: 80,
    rateLabel: '$80 / 60 min',
    trialOffer: 'First lesson 50% off',
    styles: ['Jazz', 'Contemporary', 'Improvisation'],
    studentAges: ['teens', 'adults'],
    formats: ['in-person', 'online'],
    availability: ['evenings', 'weekends'],
    skillLevels: ['intermediate', 'advanced'],
    languages: ['English'],
    credentials: ['Master of Jazz Performance — Monash University', 'Resident pianist, Paris Cat Jazz Club 2018–2022'],
    bio: 'Marcus splits his weeks between teaching and gigging across Melbourne\'s jazz circuit. His students range from singer-songwriters learning to comp behind themselves to working pianists deepening their reharmonisation chops.',
    philosophy: 'Jazz is a conversation. I teach the grammar — voicings, voice leading, time — so you can hold your own in any room you walk into.',
    studio: 'Fitzroy rehearsal space (Yamaha C3)',
    photo: null,
    accent: '#b8935a',
  },

  {
    id: 'sophia-laurent',
    name: 'Sophia Laurent',
    suburb: 'Brunswick',
    coords: [-37.7670, 144.9620],
    experience: 8,
    headline: 'Kids and early-beginner specialist — Suzuki method, gentle pacing, lots of duet playing.',
    rate: 65,
    rateLabel: '$65 / 30 min',
    trialOffer: 'Free trial lesson',
    styles: ['Classical', 'Suzuki method'],
    studentAges: ['kids', 'teens'],
    formats: ['in-person'],
    availability: ['weekdays', 'weekends'],
    skillLevels: ['beginner', 'intermediate'],
    languages: ['English', 'French'],
    credentials: ['Suzuki Piano Teacher Training Levels 1–5', 'Diploma of Music — Box Hill Institute'],
    bio: 'Sophia has built a thriving Suzuki studio in Brunswick teaching children from age 4. Parents observe lessons and learn alongside their kids — a method she credits for her near-zero dropout rate.',
    philosophy: 'A child who loves the piano will outwork a child who is forced to practise. My job is to keep the love alive while quietly building rock-solid fundamentals.',
    studio: 'Home studio, Brunswick (Kawai K-500 upright)',
    photo: null,
    accent: '#b8935a',
  },

  {
    id: 'james-whitlock',
    name: 'James Whitlock',
    suburb: 'South Yarra',
    coords: [-37.8385, 144.9925],
    experience: 25,
    headline: 'Concert performer turned mentor — coaching pre-professional pianists and competition entrants.',
    rate: 140,
    rateLabel: '$140 / 60 min',
    trialOffer: 'Audition consultation $80',
    styles: ['Classical', 'Romantic repertoire', 'Competition prep'],
    studentAges: ['teens', 'adults'],
    formats: ['in-person'],
    availability: ['weekdays'],
    skillLevels: ['advanced'],
    languages: ['English'],
    credentials: ['Concert Diploma — Royal College of Music London', '2002 Sydney International Piano Competition semi-finalist'],
    bio: 'James returned to Melbourne in 2014 after a 20-year European concert career. He now takes a small roster of 8–10 advanced students, several of whom have gone on to ANAM and overseas conservatoria.',
    philosophy: 'At the advanced level the work is internal. We strip away habit, listen harder, and find the version of the piece that only you could play.',
    studio: 'Home studio, South Yarra (Steinway B)',
    photo: null,
    accent: '#b8935a',
  },

  {
    id: 'priya-raman',
    name: 'Priya Raman',
    suburb: 'Hawthorn',
    coords: [-37.8221, 145.0350],
    experience: 14,
    headline: 'Adult returners and busy professionals — flexible scheduling, no exams unless you want them.',
    rate: 85,
    rateLabel: '$85 / 45 min',
    trialOffer: 'Free 15-minute video chat',
    styles: ['Classical', 'Film music', 'Contemporary'],
    studentAges: ['adults'],
    formats: ['in-person', 'online'],
    availability: ['evenings', 'weekends'],
    skillLevels: ['beginner', 'intermediate', 'advanced'],
    languages: ['English', 'Tamil', 'Hindi'],
    credentials: ['Bachelor of Music Education — University of Melbourne', '14 years private teaching experience'],
    bio: 'Priya specialises in adults who played as kids and want to come back, or who always wished they had. Her studio runs evenings and Saturdays to fit around full-time work.',
    philosophy: 'You don\'t need to want to be a concert pianist. You need to want one hour a week that is just for you and the keyboard.',
    studio: 'Home studio, Hawthorn (Yamaha U1)',
    photo: null,
    accent: '#b8935a',
  },

  {
    id: 'oliver-tan',
    name: 'Oliver Tan',
    suburb: 'Camberwell',
    coords: [-37.8268, 145.0589],
    experience: 9,
    headline: 'AMEB and VCE Music Performance — structured exam preparation with a high pass rate.',
    rate: 90,
    rateLabel: '$90 / 45 min',
    trialOffer: 'First lesson free',
    styles: ['Classical', 'AMEB exam prep', 'VCE Music'],
    studentAges: ['kids', 'teens'],
    formats: ['in-person'],
    availability: ['weekdays', 'evenings'],
    skillLevels: ['beginner', 'intermediate', 'advanced'],
    languages: ['English', 'Cantonese'],
    credentials: ['Master of Music (Pedagogy) — University of Melbourne', 'AMEB AMusA with distinction'],
    bio: 'Oliver runs a high-energy studio of around 35 students, the majority working through AMEB grades or VCE Music Performance. His students average distinction-grade results on first sitting.',
    philosophy: 'Exams aren\'t the goal — they\'re a deadline that focuses the work. I build a year-long curriculum and the exam happens on the way.',
    studio: 'Home studio, Camberwell (Yamaha C3)',
    photo: null,
    accent: '#b8935a',
  },

  {
    id: 'isabelle-moreau',
    name: 'Isabelle Moreau',
    suburb: 'St Kilda',
    coords: [-37.8675, 144.9810],
    experience: 11,
    headline: 'Songwriter\'s piano — chord theory, accompaniment patterns, composing at the keyboard.',
    rate: 75,
    rateLabel: '$75 / 45 min',
    trialOffer: 'First lesson $35',
    styles: ['Contemporary', 'Songwriting', 'Pop/Folk'],
    studentAges: ['teens', 'adults'],
    formats: ['in-person', 'online'],
    availability: ['evenings', 'weekends'],
    skillLevels: ['beginner', 'intermediate'],
    languages: ['English', 'French'],
    credentials: ['Bachelor of Contemporary Music — JMC Academy', 'Released two EPs as recording artist'],
    bio: 'Isabelle teaches piano as a songwriting instrument. Most of her students arrive with a guitar background and want to write at the keyboard, or arrive having played classically and want to break out of reading every note.',
    philosophy: 'If you can hum it, we can find it. I teach the shortest path from an idea in your head to a recording you can share.',
    studio: 'St Kilda studio (Roland FP-90X)',
    photo: null,
    accent: '#b8935a',
  },

  {
    id: 'thomas-novak',
    name: 'Thomas Novak',
    suburb: 'Brighton',
    coords: [-37.9061, 144.9991],
    experience: 22,
    headline: 'Patient, methodical classical teacher with a long-standing Brighton studio.',
    rate: 105,
    rateLabel: '$105 / 60 min',
    trialOffer: 'Trial lesson at standard rate, refunded if you enrol',
    styles: ['Classical', 'AMEB exam prep'],
    studentAges: ['kids', 'teens', 'adults'],
    formats: ['in-person'],
    availability: ['weekdays', 'weekends'],
    skillLevels: ['beginner', 'intermediate', 'advanced'],
    languages: ['English', 'Czech'],
    credentials: ['Diploma — Prague Conservatory', '22 years private teaching in Melbourne'],
    bio: 'Thomas trained in Prague before moving to Melbourne in 2003. His Brighton studio has a steady roster of around 30 students, several of whom have been with him for over a decade.',
    philosophy: 'Slow is fast. Most progress problems are practice problems — I teach students how to practise so the lesson becomes a check-in, not a rescue.',
    studio: 'Home studio, Brighton (Yamaha C7)',
    photo: null,
    accent: '#b8935a',
  },

  {
    id: 'amelia-park',
    name: 'Amelia Park',
    suburb: 'Prahran',
    coords: [-37.8516, 144.9931],
    experience: 6,
    headline: 'Online-first teacher specialising in busy professionals — flexible 30-min lunchtime lessons.',
    rate: 60,
    rateLabel: '$60 / 30 min',
    trialOffer: 'Free 30-minute trial',
    styles: ['Contemporary', 'Classical', 'Pop/Folk'],
    studentAges: ['adults'],
    formats: ['online'],
    availability: ['weekdays', 'evenings'],
    skillLevels: ['beginner', 'intermediate'],
    languages: ['English', 'Korean'],
    credentials: ['Bachelor of Music — Queensland Conservatorium', '6 years online teaching experience'],
    bio: 'Amelia runs a 100% online studio with students across Melbourne, Sydney, and Singapore. She uses a multi-camera setup so you can see hands, pedals, and score in one frame.',
    philosophy: 'Online done well is better than in-person done rushed. I\'ve refined this format for six years and the results speak for themselves.',
    studio: 'Online only (Yamaha P-525 + multi-cam setup)',
    photo: null,
    accent: '#b8935a',
  },

  {
    id: 'raj-mehta',
    name: 'Raj Mehta',
    suburb: 'Doncaster',
    coords: [-37.7889, 145.1239],
    experience: 16,
    headline: 'Family-focused teacher — siblings welcome, group theory classes monthly.',
    rate: 70,
    rateLabel: '$70 / 45 min',
    trialOffer: 'First lesson free for siblings',
    styles: ['Classical', 'AMEB exam prep'],
    studentAges: ['kids', 'teens'],
    formats: ['in-person'],
    availability: ['weekdays', 'evenings', 'weekends'],
    skillLevels: ['beginner', 'intermediate'],
    languages: ['English', 'Hindi', 'Gujarati'],
    credentials: ['Bachelor of Music — University of Melbourne', 'AMEB Grade 8 with honours, AMusA'],
    bio: 'Raj has built his Doncaster studio around families — many households have two or three kids learning with him. He runs a monthly Saturday theory class that\'s included in lesson fees.',
    philosophy: 'Kids learn faster when a sibling is doing it too. I lean into that — group theory, shared recitals, friendly rivalry.',
    studio: 'Home studio, Doncaster (Kawai K-300)',
    photo: null,
    accent: '#b8935a',
  },

  {
    id: 'clara-bishop',
    name: 'Clara Bishop',
    suburb: 'Northcote',
    coords: [-37.7705, 144.9982],
    experience: 7,
    headline: 'Late-starters and absolute beginners — no prior music background required.',
    rate: 65,
    rateLabel: '$65 / 45 min',
    trialOffer: 'Free 20-minute meet-and-play',
    styles: ['Classical', 'Contemporary', 'Film music'],
    studentAges: ['adults'],
    formats: ['in-person', 'online'],
    availability: ['evenings', 'weekends'],
    skillLevels: ['beginner'],
    languages: ['English'],
    credentials: ['Bachelor of Music Education — La Trobe University', '7 years adult-beginner specialism'],
    bio: 'Clara teaches adults who have never touched a piano before. Her starter curriculum has students playing a recognisable piece within four lessons and reading basic notation within twelve.',
    philosophy: 'Adult beginners have one advantage kids don\'t: they chose to be here. We use that motivation and skip the busywork.',
    studio: 'Northcote studio (Kawai KDP120 + Yamaha U1)',
    photo: null,
    accent: '#b8935a',
  },

  {
    id: 'henry-zhao',
    name: 'Henry Zhao',
    suburb: 'Glen Waverley',
    coords: [-37.8775, 145.1648],
    experience: 20,
    headline: 'Competition coach and ABRSM diploma specialist — produces international competition entrants.',
    rate: 130,
    rateLabel: '$130 / 60 min',
    trialOffer: 'Assessment consultation $100',
    styles: ['Classical', 'Competition prep', 'ABRSM exam prep'],
    studentAges: ['kids', 'teens', 'adults'],
    formats: ['in-person'],
    availability: ['weekdays', 'weekends'],
    skillLevels: ['intermediate', 'advanced'],
    languages: ['English', 'Mandarin'],
    credentials: ['Doctor of Musical Arts — Eastman School of Music', 'ABRSM examiner panel since 2015'],
    bio: 'Henry\'s Glen Waverley studio has produced 14 international competition finalists over the past decade. He takes a small roster of 12 students and runs an annual masterclass series with visiting professors.',
    philosophy: 'Talent gets you to the audition. Practice habits get you past it. I am brutally honest about both because that is what students at this level need.',
    studio: 'Home studio, Glen Waverley (Steinway A + Yamaha C7X)',
    photo: null,
    accent: '#b8935a',
  },

];

/* ---------- helpers used by the directory + profile pages ---------- */

function getTeacherById(id) {
  return TEACHERS.find(t => t.id === id);
}

function getTeacherSuburbs() {
  return Array.from(new Set(TEACHERS.map(t => t.suburb))).sort();
}

function getTeacherStyles() {
  const all = new Set();
  TEACHERS.forEach(t => t.styles.forEach(s => all.add(s)));
  /* Display order — most-requested first, then alphabetical. */
  const priority = ['Classical', 'Jazz', 'Contemporary', 'Pop/Folk', 'Songwriting',
                    'AMEB exam prep', 'VCE Music', 'ABRSM exam prep',
                    'Suzuki method', 'Competition prep', 'Improvisation',
                    'Film music', 'Romantic repertoire'];
  const ordered = [];
  priority.forEach(s => { if (all.has(s)) ordered.push(s); });
  Array.from(all).filter(s => !priority.includes(s)).sort().forEach(s => ordered.push(s));
  return ordered;
}

function getTeacherAgeGroups() {
  return [
    { id: 'kids',   label: 'Kids (4–12)' },
    { id: 'teens',  label: 'Teens (13–17)' },
    { id: 'adults', label: 'Adults (18+)' },
  ];
}

function getTeacherFormats() {
  return [
    { id: 'in-person', label: 'In-person' },
    { id: 'online',    label: 'Online' },
  ];
}

function getTeacherAvailability() {
  return [
    { id: 'weekdays', label: 'Weekday daytime' },
    { id: 'evenings', label: 'Evenings' },
    { id: 'weekends', label: 'Weekends' },
  ];
}

function getTeacherSkillLevels() {
  return [
    { id: 'beginner',     label: 'Beginner' },
    { id: 'intermediate', label: 'Intermediate' },
    { id: 'advanced',     label: 'Advanced' },
  ];
}

/* Returns the minimum and maximum hourly-equivalent rates across the
   roster, used to set bounds on the budget slider. We normalise each
   teacher's lesson rate to a per-hour figure so the slider stays
   meaningful when teachers price by 30/45/60-minute blocks. */
function getTeacherRateRange() {
  const rates = TEACHERS.map(t => t.rate);
  return { min: Math.min(...rates), max: Math.max(...rates) };
}
