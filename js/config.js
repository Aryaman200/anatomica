import * as THREE from 'three';

export const SYSTEMS = [
  {
    id: 'skin', name: 'Skin',
    desc: 'The outer body surface — a translucent shell so underlying systems remain visible.',
    file: 'models/z-skin.glb',
    hex: '#d4a574', threeColor: 0xd4a574,
    opacity: 0.10, depthWrite: false, side: THREE.DoubleSide,
    roughness: 0.9, metalness: 0.0,
    active: false,
  },
  {
    id: 'muscular', name: 'Muscles',
    desc: 'Skeletal muscles from face to feet.',
    file: 'models/z-muscular.glb',
    hex: '#e85d75', threeColor: 0xe85d75,
    opacity: 0.68, depthWrite: true, side: THREE.DoubleSide,
    roughness: 0.6, metalness: 0.0,
    active: false,
  },
  {
    id: 'skeleton', name: 'Skeleton',
    desc: 'Every bone — skull, spine, ribcage, limbs.',
    file: 'models/z-skeleton.glb',
    hex: '#b8cfe8', threeColor: 0xb8cfe8,
    opacity: 0.82, depthWrite: true, side: THREE.FrontSide,
    roughness: 0.5, metalness: 0.05,
    active: true,
  },
  {
    id: 'cardiovascular', name: 'Cardiovascular',
    desc: 'Heart and full arterial and venous tree.',
    file: 'models/z-cardiovascular.glb',
    hex: '#ff5252', threeColor: 0xff5252,
    opacity: 0.80, depthWrite: true, side: THREE.FrontSide,
    roughness: 0.4, metalness: 0.0,
    active: true,
  },
  {
    id: 'nervous', name: 'Nervous System',
    desc: 'Brain, spinal cord, and peripheral nerves.',
    file: 'models/z-nervous.glb',
    hex: '#a78bfa', threeColor: 0xa78bfa,
    opacity: 0.72, depthWrite: true, side: THREE.FrontSide,
    roughness: 0.55, metalness: 0.0,
    active: false,
  },
  {
    id: 'organs', name: 'Organs',
    desc: 'Lungs, liver, stomach, intestines, kidneys, spleen.',
    file: 'models/z-organs.glb',
    hex: '#38bdf8', threeColor: 0x38bdf8,
    opacity: 0.78, depthWrite: true, side: THREE.DoubleSide,
    roughness: 0.5, metalness: 0.0,
    active: true,
  },
];

export const SYS_HEX = {};
SYSTEMS.forEach(s => SYS_HEX[s.id] = s.hex);

export function getMeshColor(meshName, sys) {
  const n = (meshName || '').toLowerCase();

  if (sys.id === 'organs') {
    if (n.includes('liver'))                              return 0x6b1008;
    if (n.includes('lung') || n.includes('pulmon'))       return 0xe87080;
    if (n.includes('heart') || n.includes('cardiac'))     return 0xaa1111;
    if (n.includes('stomach') || n.includes('gastric'))   return 0xf0a060;
    if (n.includes('colon') || n.includes('sigmoid') ||
        n.includes('rectum') || n.includes('caec'))       return 0xd49050;
    if (n.includes('intestin') || n.includes('ileum') ||
        n.includes('jejun') || n.includes('duoden'))      return 0xf0c888;
    if (n.includes('kidney') || n.includes('renal'))      return 0xb83820;
    if (n.includes('spleen'))                             return 0x7a2040;
    if (n.includes('pancrea'))                            return 0xf0c060;
    if (n.includes('gallbladder') || n.includes('gall'))  return 0x3a8818;
    if (n.includes('bladder') || n.includes('vesic'))     return 0xd8dc40;
    if (n.includes('oesophag') || n.includes('esophag'))  return 0xff8855;
    if (n.includes('thyroid') || n.includes('thymus'))    return 0xffcc55;
    if (n.includes('trachea') || n.includes('bronch'))    return 0xa8c8f0;
    if (n.includes('diaphragm'))                          return 0xdd7744;
    if (n.includes('uter') || n.includes('ovar'))         return 0xdd5577;
    if (n.includes('prostat'))                            return 0xcc8844;
    if (n.includes('adrenal') || n.includes('supraren'))  return 0xf0a030;
    if (n.includes('spinal') || n.includes('cord'))       return 0xffe080;
    if (n.includes('eye') || n.includes('cornea') || 
        n.includes('sclera') || n.includes('globe') ||
        n.includes('lens'))                               return 0xf4f4f4;
    return 0xcc8877; // Flesh tone for unrecognized organs
  }

  if (sys.id === 'cardiovascular') {
    if (n.includes('heart') || n.includes('cardiac') ||
        n.includes('ventric') || n.includes('atri'))      return 0xbb1010;
    if (n.includes('aorta'))                              return 0xdd1818;
    if (n.includes('pulmon') && n.includes('artery'))     return 0xff6655;
    if (n.includes('pulmon') && n.includes('vein'))       return 0x9944cc;
    if (n.includes('vein') || n.includes('ven') ||
        n.includes('cava') || n.includes('jugul'))        return 0x7722bb;
    if (n.includes('artery') || n.includes('arteri') ||
        n.includes('coronar'))                            return 0xee2020;
    if (n.includes('capillar'))                           return 0xff8888;
    return 0xaa2222; // Deep red for unrecognized vessels
  }

  if (sys.id === 'nervous') {
    if (n.includes('eye') || n.includes('retina') || 
        n.includes('cornea') || n.includes('sclera') || 
        n.includes('globe') || n.includes('lens') ||
        n.includes('optic'))                              return 0xf4f4f4;
    if (n.includes('brain') || n.includes('cerebr') ||
        n.includes('cerebellum') || n.includes('medull') ||
        n.includes('pons') || n.includes('thalamus') ||
        n.includes('hypothal') || n.includes('hippoc'))   return 0xffc090;
    if (n.includes('spinal') || n.includes('cord'))       return 0xffd880;
    if (n.includes('gangl'))                              return 0xffaa40;
    return 0xf0e0b0; // Pale yellow for unrecognized nerves
  }

  if (sys.id === 'skeleton') {
    if (n.includes('skull') || n.includes('mandible') ||
        n.includes('maxilla') || n.includes('cranial'))   return 0xd4ccba;
    if (n.includes('vertebr') || n.includes('sacrum') ||
        n.includes('coccyx'))                             return 0xc8c0ac;
    if (n.includes('rib') || n.includes('sternum'))       return 0xccc4b0;
    if (n.includes('pelvis') || n.includes('ilium') ||
        n.includes('ischium') || n.includes('pubis'))     return 0xcac2ae;
    if (n.includes('femur') || n.includes('tibia') ||
        n.includes('fibula') || n.includes('patella'))    return 0xd0c8b4;
    if (n.includes('humerus') || n.includes('radius') ||
        n.includes('ulna') || n.includes('clavicle') ||
        n.includes('scapula'))                            return 0xccc4b0;
    if (n.includes('carpus') || n.includes('metacarp') ||
        n.includes('phalanx') || n.includes('tarsus') ||
        n.includes('metatars'))                           return 0xd2cab6;
    if (n.includes('cartilage') || n.includes('costal') ||
        n.includes('ligament') || n.includes('disc') ||
        n.includes('meniscus'))                           return 0xe5e7e9;
    return 0xd4ccba; // Bone color for unrecognized bones
  }

  if (sys.id === 'muscular') {
    if (n.includes('tendon') || n.includes('aponeurosis') || 
        n.includes('fascia') || n.includes('ligament') ||
        n.includes('galea'))                              return 0xe5e2dc;
    const hash = n.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const variation = ((hash % 20) - 10) / 255;
    const base = new THREE.Color(0xc03030);
    base.r = Math.max(0, Math.min(1, base.r + variation));
    return base.getHex();
  }

  return sys.threeColor;
}

export const ANATOMY_TERMS = [
  { label:'Liver',               sys:'organs',         keywords:['liver'] },
  { label:'Heart',               sys:'cardiovascular', keywords:['heart','cardiac','ventric','atri'] },
  { label:'Lungs',               sys:'organs',         keywords:['lung','pulmon'] },
  { label:'Stomach',             sys:'organs',         keywords:['stomach','gastric'] },
  { label:'Kidneys',             sys:'organs',         keywords:['kidney','renal'] },
  { label:'Spleen',              sys:'organs',         keywords:['spleen'] },
  { label:'Pancreas',            sys:'organs',         keywords:['pancrea'] },
  { label:'Intestines',          sys:'organs',         keywords:['intestin','ileum','jejun','duoden','colon','sigmoid','rectum'] },
  { label:'Gallbladder',         sys:'organs',         keywords:['gallbladder','gall'] },
  { label:'Bladder',             sys:'organs',         keywords:['bladder','vesic'] },
  { label:'Oesophagus',          sys:'organs',         keywords:['oesophag','esophag'] },
  { label:'Thyroid',             sys:'organs',         keywords:['thyroid','thymus'] },
  { label:'Trachea',             sys:'organs',         keywords:['trachea','bronch'] },
  { label:'Diaphragm',           sys:'organs',         keywords:['diaphragm'] },
  { label:'Adrenal Glands',      sys:'organs',         keywords:['adrenal','supraren'] },
  { label:'Aorta',               sys:'cardiovascular', keywords:['aorta'] },
  { label:'Arteries',            sys:'cardiovascular', keywords:['artery','arteri','coronar'] },
  { label:'Veins',               sys:'cardiovascular', keywords:['vein','ven','cava','jugul'] },
  { label:'Brain',               sys:'nervous',        keywords:['brain','cerebr','cerebellum','medull','pons','thalamus','hypothal','hippoc'] },
  { label:'Spinal Cord',         sys:'nervous',        keywords:['spinal','cord'] },
  { label:'Nerves',              sys:'nervous',        keywords:['nerve','gangl'] },
  { label:'Skull',               sys:'skeleton',       keywords:['skull','mandible','maxilla','cranial'] },
  { label:'Spine',               sys:'skeleton',       keywords:['vertebr','sacrum','coccyx'] },
  { label:'Ribs',                sys:'skeleton',       keywords:['rib','sternum'] },
  { label:'Pelvis',              sys:'skeleton',       keywords:['pelvis','ilium','ischium','pubis'] },
  { label:'Femur',               sys:'skeleton',       keywords:['femur'] },
  { label:'Tibia',               sys:'skeleton',       keywords:['tibia','fibula'] },
  { label:'Humerus',             sys:'skeleton',       keywords:['humerus'] },
  { label:'Hands',               sys:'skeleton',       keywords:['carpus','metacarp','phalanx'] },
  { label:'Feet',                sys:'skeleton',       keywords:['tarsus','metatars'] },
  { label:'Eye',                 sys:'nervous',        keywords:['eye','cornea','retina','lens','globe','sclera','optic'] },
  { label:'Ear',                 sys:'nervous',        keywords:['ear','cochlea','tympanic','auricle'] },
  { label:'Prostate',            sys:'organs',         keywords:['prostat'] },
  { label:'Uterus',              sys:'organs',         keywords:['uter'] },
  { label:'Ovaries',             sys:'organs',         keywords:['ovar'] },
  { label:'Testes',              sys:'organs',         keywords:['testis','testic'] },
  { label:'Lymph Nodes',         sys:'organs',         keywords:['lymph','node'] },
  { label:'Bone Marrow',         sys:'skeleton',       keywords:['marrow'] },
  { label:'Joints',              sys:'skeleton',       keywords:['joint','articul'] },
  { label:'Tendons',             sys:'muscular',       keywords:['tendon'] },
  { label:'Ligaments',           sys:'skeleton',       keywords:['ligament'] },
  { label:'Teeth',               sys:'skeleton',       keywords:['tooth','teeth','dental'] },
  { label:'Jaw',                 sys:'skeleton',       keywords:['jaw','mandible','maxilla'] },
  { label:'Shoulder',            sys:'skeleton',       keywords:['shoulder','scapula','clavicle'] },
  { label:'Knee',                sys:'skeleton',       keywords:['knee','patella','meniscus'] },
  { label:'Ankle',               sys:'skeleton',       keywords:['ankle','talus'] },
  { label:'Wrist',               sys:'skeleton',       keywords:['wrist','carpal'] },
  { label:'Elbow',               sys:'skeleton',       keywords:['elbow','olecranon'] },
  { label:'Hip',                 sys:'skeleton',       keywords:['hip','pelvis','acetabulum'] },
  { label:'Pituitary Gland',     sys:'nervous',        keywords:['pituitary'] },
  { label:'Hypothalamus',        sys:'nervous',        keywords:['hypothal'] },
  { label:'Cerebellum',          sys:'nervous',        keywords:['cerebellum'] },
  { label:'Brainstem',           sys:'nervous',        keywords:['brainstem','medulla','pons'] },
  { label:'Cornea',              sys:'nervous',        keywords:['cornea'] },
  { label:'Retina',              sys:'nervous',        keywords:['retina'] },
  { label:'Nasal Cavity',        sys:'organs',         keywords:['nasal','nose'] },
  { label:'Sinuses',             sys:'organs',         keywords:['sinus'] },
  { label:'Larynx',              sys:'organs',         keywords:['larynx'] },
  { label:'Pharynx',             sys:'organs',         keywords:['pharynx'] },
  { label:'Lymphatic System',    sys:'organs',         keywords:['lymphatic'] },
  { label:'Skeleton',            sys:'skeleton',       keywords:null },
  { label:'Muscles',             sys:'muscular',       keywords:null },
  { label:'Skin',                sys:'skin',           keywords:null },
  { label:'Cardiovascular System',sys:'cardiovascular',keywords:null },
  { label:'Nervous System',      sys:'nervous',        keywords:null },
  { label:'Organs',              sys:'organs',         keywords:null },
];
