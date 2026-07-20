// ============================================================================
//  groups.js — the coarse "highlight group" layer.
//
//  Conditions/medications reference friendly labels ('Heart', 'Lungs', 'Femur'),
//  but the model is named at fine granularity ('Left ventricle', 'Superior lobe
//  of left lung'). Each group maps a friendly label to the set of fine
//  ANATOMY_STRUCTURES (js/data/anatomy.js) that make it up, via regex over the
//  cleaned lower-cased structure label. Matching is cross-system on purpose
//  (the ear's ossicles live in the skeleton, the larynx spans cartilage +
//  organ, etc.).
//
//  A group whose regex matches nothing in THESE models (spleen, uterus, ovaries,
//  bone marrow, lymph nodes — absent from this male Z-Anatomy export) is marked
//  modelled:false: conditions may still reference it, but it is never shown in
//  anatomy search and highlights render as "not individually modelled".
// ============================================================================
import { ANATOMY_STRUCTURES } from './anatomy.js?v=1784447089342';

// system:'*' (or omitted) = match across every system.
const DEFS = [
  // ── skeleton ──
  { label: 'Skull',    sys: 'skeleton', re: [/frontal bone|parietal bone|occipital bone|temporal bone|sphenoid bone|ethmoid bone|nasal bone|lacrimal bone|vomer|zygomatic bone|palatine bone|inferior nasal concha|cells of ethmoid|cranium/] },
  { label: 'Jaw',      sys: 'skeleton', re: [/mandible|maxilla/] },
  { label: 'Teeth',    sys: 'skeleton', re: [/incisor|canine|molar|premolar|\btooth\b/] },
  { label: 'Ribs',     sys: 'skeleton', re: [/\brib\b|costal cartilage|sternum|manubrium|xiphoid/] },
  { label: 'Spine',    sys: 'skeleton', re: [/vertebra|sacrum|coccyx|atlas \(c1\)|axis \(c2\)|intervertebral/] },
  { label: 'Skeleton', sys: 'skeleton', re: [/.*/] }, // whole system
  { label: 'Femur',    sys: 'skeleton', re: [/^femur$/] },
  { label: 'Tibia',    sys: 'skeleton', re: [/^tibia$|^fibula$/] },
  { label: 'Humerus',  sys: 'skeleton', re: [/^humerus$|^radius$|^ulna$/] },
  { label: 'Hands',    sys: 'skeleton', re: [/metacarpal|phalanx of .* finger of hand|scaphoid|lunate|triquetrum|pisiform|trapezium bone|trapezoid bone|capitate|hamate/] },
  { label: 'Feet',     sys: 'skeleton', re: [/metatarsal|phalanx of .* finger of foot|calcaneus|talus|navicular bone|cuboid|cuneiform|sesamoid bones of foot/] },
  { label: 'Wrist',    sys: 'skeleton', re: [/scaphoid|lunate|triquetrum|pisiform|trapezium bone|trapezoid bone|capitate|hamate/] },
  { label: 'Elbow',    sys: 'skeleton', re: [/^humerus$|^radius$|^ulna$/] },
  { label: 'Shoulder', sys: 'skeleton', re: [/scapula|clavicle/] },
  { label: 'Hip',      sys: 'skeleton', re: [/hip bone|^sacrum$/] },
  { label: 'Knee',     sys: 'skeleton', re: [/patella/] },
  { label: 'Ankle',    sys: 'skeleton', re: [/talus|calcaneus/] },
  { label: 'Joints',   sys: 'skeleton', re: [/cartilage|meniscus|intervertebral disc/] },

  // ── muscular ──
  { label: 'Muscles',   sys: 'muscular', re: [/.*/] },
  { label: 'Tendons',   sys: 'muscular', re: [/tendon/] },
  { label: 'Ligaments', re: [/ligament/] },

  // ── cardiovascular ──
  { label: 'Heart', sys: 'cardiovascular', re: [/ventricle|atrium|papillary muscle|leaflet|valve|interventricular|interatrial|chordae|myocard|trabecula|pericardi|coronary sinus|cardiac vein|pulmonary trunk|ascending aorta|superior vena cava|inferior vena cava \(thoracic|moderator band|crista terminalis|fossa ovalis|conus arteriosus|sinus of heart|bifurcation of pulmonary/] },
  { label: 'Aorta',                sys: 'cardiovascular', re: [/aorta|aortic/] },
  { label: 'Arteries',             sys: 'cardiovascular', re: [/artery|arterial|arteriole|\btrunk\b|circle of|aorta/] },
  { label: 'Veins',                sys: 'cardiovascular', re: [/\bvein\b|venous|vena|cava|venule|jugular|dural sinus|sinus of heart/] },
  { label: 'Cardiovascular System',sys: 'cardiovascular', re: [/.*/] },

  // ── nervous ──
  { label: 'Brain',          sys: 'nervous', re: [/cerebr|cerebell|\bbrain|\blobe\b|gyrus|sulcus|thalam|hippocamp|\bpons\b|medulla oblongata|midbrain|corpus callosum|ventricle|amygdala|insula|fornix|caudate|putamen|pallidum|cortex/] },
  { label: 'Spinal Cord',    sys: 'nervous', re: [/spinal cord|cauda equina|conus medullaris|filum terminale/] },
  { label: 'Nerves',         sys: 'nervous', re: [/nerve|plexus|ganglion|ramus|trunk of|root of/] },
  { label: 'Nervous System', sys: 'nervous', re: [/.*/] },
  { label: 'Brainstem',      sys: 'nervous', re: [/medulla oblongata|\bpons\b|midbrain|brainstem/] },
  { label: 'Cerebellum',     sys: 'nervous', re: [/cerebell/] },
  { label: 'Eye', re: [/eyeball|\beye\b|cornea|\bretina\b|sclera|\bchoroid\b|ciliary body|ciliary muscle|ciliary proc|iris|pupil|vitreous|lens of eye|conjunctiva|optic|lacrimal gland|lacrimal sac|nasolacrimal/] },
  { label: 'Ear',            re: [/cochlea|tympanic|\bmalleus\b|\bincus\b|\bstapes\b|auricle|labyrinth|vestibul|semicircular|eardrum|\bear\b|utricle|saccule/] },
  { label: 'Hypothalamus',   re: [/hypothalamus/] },
  { label: 'Pituitary Gland',re: [/hypophysis|pituitary/] },

  // ── organs ──
  { label: 'Liver',         re: [/liver|hepatic/] },
  { label: 'Lungs',         re: [/\blung\b|bronch|pleura|lobe of (left|right) lung|lingula/] },
  { label: 'Stomach',       re: [/stomach|gastric/] },
  { label: 'Kidneys',       re: [/kidney|renal pelvis/] },
  { label: 'Pancreas',      re: [/pancrea/] },
  { label: 'Gallbladder',   re: [/gallbladder|bile duct|biliary/] },
  { label: 'Bladder',       re: [/urinary bladder|\bbladder\b|ureter|urethra/] },
  { label: 'Oesophagus',    re: [/oesophag|esophag/] },
  { label: 'Thyroid',       re: [/thyroid gland|parathyroid/] },
  { label: 'Trachea',       re: [/trachea/] },
  { label: 'Diaphragm',     re: [/diaphragm/] },
  { label: 'Adrenal Glands',re: [/suprarenal|adrenal/] },
  { label: 'Intestines',    re: [/intestin|jejunum|ileum|duoden|colon|caecum|rectum|appendix|taenia|omentum|mesocolon|mesentery|meso-appendix/] },
  { label: 'Larynx',        re: [/larynx|laryngo|epiglottis|arytenoid|cricoid|corniculate|thyroid cartilage|vocal/] },
  { label: 'Pharynx',       re: [/pharynx/] },
  { label: 'Nasal Cavity',  re: [/nasal cavity|mucosa of nasal|nasal mucosa/] },
  { label: 'Sinuses',       re: [/sinus of frontal|sinus of sphenoid|cells of ethmoid|paranasal|maxillary sinus/] },
  { label: 'Prostate',      re: [/prostate/] },
  { label: 'Testes',        re: [/testis|testes|epididymis/] },
  { label: 'Organs',        sys: 'organs', re: [/.*/] },
  { label: 'Skin',          sys: 'skin', re: [/.*/] },

  // ── not present in this male export — kept for condition references ──
  { label: 'Spleen',      re: [/\bspleen\b/] },
  { label: 'Uterus',      re: [/uterus|uterine|cervix of uterus|endometri|myometri/] },
  { label: 'Ovaries',     re: [/ovary|ovarian|fallopian|uterine tube/] },
  { label: 'Bone Marrow', re: [/bone marrow|marrow/] },
  { label: 'Lymph Nodes', re: [/lymph node|lymphatic/] },
];

const lc = s => s.toLowerCase();

export const GROUPS = DEFS.map(d => {
  const members = ANATOMY_STRUCTURES.filter(s => {
    if (d.sys && d.sys !== s.system) return false;
    const l = lc(s.label);
    return d.re.some(r => r.test(l));
  }).map(s => s.label);
  return { label: d.label, system: d.sys || null, modelled: members.length > 0, members };
});

export const GROUP_BY_LABEL = new Map(GROUPS.map(g => [g.label, g]));

// reverse: fine structure label -> coarse group labels it belongs to
const REVERSE = new Map();
for (const g of GROUPS) {
  if (!g.modelled) continue;
  for (const m of g.members) {
    if (!REVERSE.has(m)) REVERSE.set(m, []);
    if (!REVERSE.get(m).includes(g.label)) REVERSE.get(m).push(g.label);
  }
}

// fine structure labels that make up a coarse label (empty if not modelled)
export function structuresForGroup(label) {
  const g = GROUP_BY_LABEL.get(label);
  return g ? g.members : [];
}
// coarse group labels a fine structure belongs to (for condition/med lookup)
export function groupsForStructure(label) {
  return REVERSE.get(label) || [];
}
export function isGroupLabel(label) { return GROUP_BY_LABEL.has(label); }
export function isModelled(label) {
  const g = GROUP_BY_LABEL.get(label);
  return g ? g.modelled : false;
}
