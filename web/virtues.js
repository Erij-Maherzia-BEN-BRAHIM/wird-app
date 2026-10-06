// Authentic sayings about Surat Al-Baqara and about intention / consistency.
// Text and source labels only; the group admin should review them before sharing widely.
export const VIRTUES = [
  { t: 'لا تجعلوا بيوتكم مقابر، إنّ الشيطان ينفر من البيت الذي تُقرأ فيه سورة البقرة.', s: 'رواه مسلم' },
  { t: 'اقرؤوا سورة البقرة، فإنّ أخذها بركة، وتركها حسرة، ولا تستطيعها البَطَلة.', s: 'رواه مسلم' },
  { t: 'مَن قرأ بالآيتين من آخر سورة البقرة في ليلة كفتاه.', s: 'متفق عليه' },
  { t: 'مَن قرأ حرفًا من كتاب الله فله به حسنة، والحسنة بعشر أمثالها.', s: 'رواه الترمذي' },
  { t: 'أحبّ الأعمال إلى الله أدومها وإن قلّ.', s: 'متفق عليه' },
];

export const INTENTION = {
  t: 'إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى.',
  s: 'متفق عليه',
  renew: 'نويتُ قراءة وردي من سورة البقرة ابتغاء وجه الله، واللهم أعنّي ولا تُعن عليّ.',
  accept: 'ربَّنا تقبَّل منّا إنَّك أنت السميع العليم',
  acceptSrc: 'البقرة ١٢٧',
};

// Same saying for everyone on the same day; rotates daily.
export function virtueOf(dayIndex) {
  const n = VIRTUES.length;
  return VIRTUES[((dayIndex % n) + n) % n];
}
