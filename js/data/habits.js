// Cited health habits, grouped into families. Each maps to the organs it benefits.

export const HABITS = [
  {
    name: 'Regular exercise', family: 'Move',
    mechanism: 'Aerobic and resistance activity strengthens the heart muscle, improves insulin sensitivity, and builds bone density.',
    organs: ['Heart', 'Arteries', 'Skeleton', 'Muscles', 'Pancreas'],
    sources: ['WHO physical activity guidelines', 'CDC'],
  },
  {
    name: 'Staying hydrated', family: 'Fuel',
    mechanism: 'Adequate water intake helps the kidneys filter waste efficiently and keeps blood volume and pressure stable.',
    organs: ['Kidneys', 'Veins', 'Arteries'],
    sources: ['CDC', 'Medical consensus'],
  },
  {
    name: 'Balanced diet', family: 'Fuel',
    mechanism: 'A diet rich in fiber, lean protein, and unsaturated fat supports steady blood sugar and lowers artery-clogging cholesterol.',
    organs: ['Pancreas', 'Liver', 'Arteries', 'Intestines'],
    sources: ['WHO', 'US Dietary Guidelines'],
  },
  {
    name: 'Quality sleep', family: 'Rest',
    mechanism: 'Deep sleep consolidates memory, regulates hunger hormones, and gives the cardiovascular system nightly recovery time.',
    organs: ['Brain', 'Heart', 'Nervous System'],
    sources: ['CDC', 'US Surgeon General'],
  },
  {
    name: 'Managing stress', family: 'Rest',
    mechanism: 'Lower chronic cortisol reduces strain on the adrenal glands, blood pressure, and the gut-brain axis.',
    organs: ['Adrenal Glands', 'Brain', 'Heart'],
    sources: ['US Surgeon General', 'Medical consensus'],
  },
  {
    name: 'Avoiding smoking', family: 'Avoid',
    mechanism: 'Cutting out tobacco smoke prevents ongoing damage to the airways, alveoli, and artery walls.',
    organs: ['Lungs', 'Arteries', 'Trachea'],
    sources: ['WHO', 'CDC'],
  },
  {
    name: 'Limiting alcohol', family: 'Avoid',
    mechanism: 'Less alcohol reduces the toxic load the liver has to process and lowers the risk of scarring over time.',
    organs: ['Liver', 'Brain'],
    sources: ['WHO', 'Medical consensus'],
  },
  {
    name: 'Routine checkups', family: 'Avoid',
    mechanism: 'Regular screening catches silent problems, like high blood pressure or high cholesterol, before they cause damage.',
    organs: ['Heart', 'Arteries', 'Kidneys'],
    sources: ['CDC', 'Medical consensus'],
  },
];

export const HABIT_FAMILIES = ['Move', 'Rest', 'Fuel', 'Avoid'];

export function getHabitsForOrgan(label) {
  return HABITS.filter(h => h.organs.includes(label));
}
