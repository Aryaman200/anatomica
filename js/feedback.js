/**
 * feedback.js — smarter feedback engine for the NEET quiz.
 *
 * Pure ESM. NO DOM, NO Date.now, NO Math.random, NO imports from other app
 * files. Everything here is deterministic: identical inputs always produce
 * identical outputs, so results are stable and unit-testable.
 *
 * Public API (consumed by js/quiz.js):
 *   topicFor(question) -> { subject, topic, chapter }
 *   analyze(answers, questions) -> { bySubject, byTopic, weakTopics, recommendations, srs }
 *   default export -> { topicFor, analyze }
 */

// ── Keyword → chapter maps (NEET Biology / Physics / Chemistry) ─────────────
// Each entry: { topic, chapter, keys[], highYield? }. Matching is a plain
// lower-cased substring test against question.question.text. Within a subject
// the FIRST matching entry (array order) wins, so order specific chapters so a
// broad keyword never shadows a narrower one.

/** @typedef {{topic:string, chapter:string, keys:string[], highYield?:boolean}} ChapterMap */

/** @type {ChapterMap[]} */
const BIOLOGY_MAP = [
  { topic: 'Photosynthesis', chapter: 'Class 11 Ch.13 – Photosynthesis in Higher Plants', highYield: true,
    keys: ['photosynthesis', 'chlorophyll', 'thylakoid', 'stroma', 'calvin', 'light reaction', 'dark reaction',
           'photorespiration', 'c3', 'c4', 'cam pathway', 'rubisco', 'photosystem', 'z scheme', 'photophosphorylation'] },
  { topic: 'Respiration in Plants', chapter: 'Class 11 Ch.14 – Respiration in Plants',
    keys: ['glycolysis', 'krebs cycle', 'tca cycle', 'electron transport chain', 'oxidative phosphorylation',
           'fermentation', 'nadh', 'fadh', 'cytochrome', 'pyruvate', 'acetyl coa', 'respiratory quotient'] },
  { topic: 'Plant Growth & Hormones', chapter: 'Class 11 Ch.15 – Plant Growth and Development',
    keys: ['auxin', 'gibberellin', 'cytokinin', 'abscisic', 'ethylene', 'phytohormone', 'apical dominance',
           'bolting', 'vernalisation', 'photoperiodism', 'senescence', 'dormancy'] },
  { topic: 'Cell Structure & Organelles', chapter: 'Class 11 Ch.8 – Cell: The Unit of Life', highYield: true,
    keys: ['mitochondria', 'chloroplast', 'ribosome', 'golgi', 'endoplasmic reticulum', 'lysosome', 'vacuole',
           'centriole', 'nucleosome', 'chromatin', 'cell wall', 'plasma membrane', 'fluid mosaic', 'peroxisome'] },
  { topic: 'Cell Division', chapter: 'Class 11 Ch.10 – Cell Cycle and Cell Division',
    keys: ['mitosis', 'meiosis', 'prophase', 'metaphase', 'anaphase', 'telophase', 'interphase',
           'crossing over', 'chiasmata', 'bivalent', 'spindle fibre', 'cytokinesis', 'leptotene', 'pachytene'] },
  { topic: 'Biomolecules', chapter: 'Class 11 Ch.9 – Biomolecules',
    keys: ['enzyme kinetics', 'active site', 'coenzyme', 'cofactor', 'allosteric', 'peptide bond', 'amino acid',
           'polysaccharide', 'nucleotide', 'denaturation', 'lineweaver'] },
  { topic: 'Genetics & Heredity', chapter: 'Class 12 Ch.5 – Principles of Inheritance and Variation', highYield: true,
    keys: ['mendel', 'dominance', 'recessiv', 'codominance', 'incomplete dominance', 'dihybrid', 'monohybrid',
           'genotype', 'phenotype', 'heterozygous', 'homozygous', 'sex-linked', 'haemophilia', 'colour blind',
           'pedigree', 'test cross', 'polygenic', 'pleiotropy', 'epistasis', 'linkage'] },
  { topic: 'Molecular Basis of Inheritance', chapter: 'Class 12 Ch.6 – Molecular Basis of Inheritance', highYield: true,
    keys: ['dna replication', 'transcription', 'translation', 'mrna', 'trna', 'rrna', 'codon', 'anticodon',
           'operon', 'lac operon', 'promoter', 'repressor', 'okazaki', 'helicase', 'okazaki fragment',
           'central dogma', 'genetic code', 'human genome'] },
  { topic: 'Human Physiology – Digestion', chapter: 'Class 11 Ch.16 – Digestion and Absorption',
    keys: ['digestion', 'duodenum', 'jejunum', 'ileum', 'pepsin', 'trypsin', 'amylase', 'lipase', 'bile',
           'peristalsis', 'villus', 'villi', 'chyme', 'chylomicron', 'lacteals'] },
  { topic: 'Human Physiology – Respiration', chapter: 'Class 11 Ch.17 – Breathing and Exchange of Gases',
    keys: ['alveoli', 'diaphragm', 'tidal volume', 'vital capacity', 'residual volume', 'oxygen dissociation',
           'bohr effect', 'bicarbonate', 'haemoglobin', 'emphysema', 'spirometry'] },
  { topic: 'Human Physiology – Circulation', chapter: 'Class 11 Ch.18 – Body Fluids and Circulation', highYield: true,
    keys: ['cardiac cycle', 'systole', 'diastole', 'ecg', 'blood pressure', 'sa node', 'av node', 'pacemaker',
           'purkinje', 'coagulation', 'fibrin', 'thrombin', 'rh factor', 'lymph', 'plasma protein'] },
  { topic: 'Human Physiology – Excretion', chapter: 'Class 11 Ch.19 – Excretory Products and their Elimination',
    keys: ['nephron', 'glomerulus', 'bowman', 'loop of henle', 'collecting duct', 'juxtaglomerular',
           'ultrafiltration', 'reabsorption', 'micturition', 'dialysis', 'osmoregulation'] },
  { topic: 'Human Physiology – Locomotion', chapter: 'Class 11 Ch.20 – Locomotion and Movement',
    keys: ['sarcomere', 'actin', 'myosin', 'sliding filament', 'troponin', 'tropomyosin', 'tendon', 'ligament',
           'skeletal muscle', 'osteoporosis', 'arthritis', 'myofibril'] },
  { topic: 'Human Physiology – Neural Control', chapter: 'Class 11 Ch.21 – Neural Control and Coordination',
    keys: ['neuron', 'synapse', 'neurotransmitter', 'acetylcholine', 'action potential', 'resting potential',
           'reflex arc', 'cerebrum', 'cerebellum', 'medulla', 'hypothalamus', 'myelinated', 'saltatory', 'axon'] },
  { topic: 'Human Physiology – Endocrinology', chapter: 'Class 11 Ch.22 – Chemical Coordination and Integration', highYield: true,
    keys: ['hormone', 'pituitary', 'thyroid', 'adrenal', 'insulin', 'glucagon', 'thyroxine', 'adrenaline',
           'cortisol', 'oestrogen', 'progesterone', 'oxytocin', 'vasopressin', 'melatonin', 'goitre', 'diabetes insipidus'] },
  { topic: 'Sexual Reproduction in Flowering Plants', chapter: 'Class 12 Ch.2 – Sexual Reproduction in Flowering Plants',
    keys: ['pollination', 'pollen grain', 'ovule', 'stamen', 'pistil', 'anther', 'stigma', 'tapetum',
           'sporopollenin', 'gametophyte', 'sporophyte', 'double fertilization', 'endosperm', 'embryo sac', 'apomixis'] },
  { topic: 'Human Reproduction', chapter: 'Class 12 Ch.3 – Human Reproduction',
    keys: ['spermatogenesis', 'oogenesis', 'graafian follicle', 'ovulation', 'menstrual', 'fallopian',
           'placenta', 'implantation', 'sertoli', 'leydig', 'inhibin', 'corpus luteum', 'gestation'] },
  { topic: 'Reproductive Health', chapter: 'Class 12 Ch.4 – Reproductive Health',
    keys: ['contraception', 'vasectomy', 'tubectomy', 'oral pill', 'mtp', 'amniocentesis', 'ivf', 'zift',
           'gift', 'infertility', 'artificial insemination', 'copper-t'] },
  { topic: 'Evolution', chapter: 'Class 12 Ch.7 – Evolution', highYield: true,
    keys: ['darwin', 'natural selection', 'homologous organ', 'analogous organ', 'vestigial', 'convergent evolution',
           'divergent evolution', 'adaptive radiation', 'hardy weinberg', 'genetic drift', 'gene flow', 'speciation', 'lamarck'] },
  { topic: 'Human Health & Disease', chapter: 'Class 12 Ch.8 – Human Health and Disease', highYield: true,
    keys: ['immunity', 'antibody', 'antigen', 'vaccine', 'b cell', 't cell', 'lymphocyte', 'malaria', 'typhoid',
           'pneumonia', 'metastasis', 'passive immunity', 'active immunity', 'autoimmune', 'allergy', 'interferon'] },
  { topic: 'Microbes in Human Welfare', chapter: 'Class 12 Ch.10 – Microbes in Human Welfare',
    keys: ['biogas', 'sewage treatment', 'biofertilizer', 'rhizobium', 'mycorrhiza', 'penicillin', 'biocontrol',
           'baculovirus', 'trichoderma', 'lab culture', 'activated sludge'] },
  { topic: 'Biotechnology', chapter: 'Class 12 Ch.11 – Biotechnology: Principles and Processes', highYield: true,
    keys: ['recombinant dna', 'restriction enzyme', 'ligase', 'plasmid', 'cloning vector', 'gel electrophoresis',
           'polymerase chain reaction', 'pcr', 'dna fingerprinting', 'bt cotton', 'golden rice', 'gene therapy', 'bioreactor'] },
  { topic: 'Ecology & Ecosystem', chapter: 'Class 12 Ch.13–14 – Organisms & Populations / Ecosystem', highYield: true,
    keys: ['ecosystem', 'food chain', 'food web', 'trophic level', 'energy flow', 'decomposer', 'primary productivity',
           'biomass pyramid', 'population', 'natality', 'mortality', 'carrying capacity', 'logistic growth',
           'predation', 'parasitism', 'mutualism', 'commensalism', 'ecological succession'] },
  { topic: 'Biodiversity & Conservation', chapter: 'Class 12 Ch.15 – Biodiversity and Conservation',
    keys: ['biodiversity', 'species richness', 'endemic', 'biodiversity hotspot', 'iucn', 'red list', 'national park',
           'sanctuary', 'biosphere reserve', 'in situ', 'ex situ', 'endangered species'] },
  { topic: 'Structural Organisation', chapter: 'Class 11 Ch.5–6 – Morphology & Anatomy / Animal Tissues',
    keys: ['meristem', 'parenchyma', 'collenchyma', 'sclerenchyma', 'xylem', 'phloem', 'epithelium',
           'connective tissue', 'areolar', 'squamous', 'cuboidal', 'aestivation', 'placentation', 'venation'] },
  { topic: 'Biological Classification', chapter: 'Class 11 Ch.2 – Biological Classification',
    keys: ['monera', 'protista', 'archaebacteria', 'eubacteria', 'cyanobacteria', 'viroid', 'lichen',
           'bryophyte', 'pteridophyte', 'gymnosperm', 'angiosperm', 'binomial nomenclature', 'five kingdom'] },
  { topic: 'Animal Kingdom', chapter: 'Class 11 Ch.4 – Animal Kingdom',
    keys: ['porifera', 'cnidaria', 'platyhelminthes', 'nematoda', 'annelida', 'mollusca', 'arthropoda',
           'echinodermata', 'chordata', 'notochord', 'coelom', 'triploblastic', 'periplaneta', 'aschelminthes'] },
  { topic: 'Plant Kingdom', chapter: 'Class 11 Ch.3 – Plant Kingdom',
    keys: ['algae', 'chlorophyceae', 'phaeophyceae', 'rhodophyceae', 'moss', 'fern', 'prothallus',
           'heterospory', 'cycas', 'pinus', 'alternation of generation'] },
];

/** @type {ChapterMap[]} */
const PHYSICS_MAP = [
  { topic: 'Units & Measurement', chapter: 'Class 11 – Units and Measurements',
    keys: ['dimensional analysis', 'dimensional formula', 'significant figure', 'least count', 'vernier',
           'screw gauge', 'measurement error', 'percentage error', 'order of magnitude'] },
  { topic: 'Kinematics', chapter: 'Class 11 – Motion in a Straight Line / Plane',
    keys: ['projectile', 'displacement', 'relative velocity', 'uniform acceleration', 'equations of motion',
           'position-time', 'velocity-time', 'average velocity', 'freely falling'] },
  { topic: 'Laws of Motion', chapter: 'Class 11 – Laws of Motion', highYield: true,
    keys: ['newton\'s law', 'free body', 'friction', 'coefficient of friction', 'impulse', 'linear momentum',
           'tension in the string', 'banking of road', 'pseudo force', 'conservation of momentum'] },
  { topic: 'Work, Energy & Power', chapter: 'Class 11 – Work, Energy and Power', highYield: true,
    keys: ['work done', 'kinetic energy', 'potential energy', 'conservation of energy', 'elastic collision',
           'inelastic collision', 'power delivered', 'work-energy theorem', 'coefficient of restitution'] },
  { topic: 'Rotational Motion', chapter: 'Class 11 – System of Particles and Rotational Motion', highYield: true,
    keys: ['torque', 'moment of inertia', 'angular momentum', 'centre of mass', 'rolling without slipping',
           'radius of gyration', 'angular acceleration', 'rotational kinetic energy'] },
  { topic: 'Gravitation', chapter: 'Class 11 – Gravitation',
    keys: ['gravitation', 'escape velocity', 'orbital velocity', 'kepler', 'geostationary', 'satellite',
           'gravitational potential', 'acceleration due to gravity'] },
  { topic: 'Properties of Solids & Fluids', chapter: 'Class 11 – Mechanical Properties of Solids and Fluids',
    keys: ['young\'s modulus', 'bulk modulus', 'stress and strain', 'elasticity', 'surface tension', 'viscosity',
           'bernoulli', 'terminal velocity', 'capillary rise', 'pascal\'s law', 'poisson'] },
  { topic: 'Thermodynamics', chapter: 'Class 11 – Thermodynamics', highYield: true,
    keys: ['isothermal', 'adiabatic', 'carnot', 'first law of thermodynamics', 'heat engine', 'efficiency of engine',
           'internal energy', 'isobaric', 'isochoric', 'entropy'] },
  { topic: 'Kinetic Theory of Gases', chapter: 'Class 11 – Kinetic Theory',
    keys: ['kinetic theory', 'mean free path', 'degrees of freedom', 'rms speed', 'root mean square speed',
           'equipartition', 'mean square velocity'] },
  { topic: 'Thermal Properties', chapter: 'Class 11 – Thermal Properties of Matter',
    keys: ['calorimetry', 'latent heat', 'thermal expansion', 'thermal conduction', 'stefan', 'newton\'s law of cooling',
           'specific heat capacity', 'wien'] },
  { topic: 'Oscillations (SHM)', chapter: 'Class 11 – Oscillations',
    keys: ['simple harmonic', 'oscillation', 'simple pendulum', 'spring constant', 'angular frequency',
           'time period of oscillation', 'damped oscillation', 'resonance'] },
  { topic: 'Waves', chapter: 'Class 11 – Waves',
    keys: ['sound wave', 'doppler effect', 'beat frequency', 'standing wave', 'stationary wave', 'organ pipe',
           'fundamental frequency', 'harmonics', 'progressive wave', 'speed of sound'] },
  { topic: 'Electrostatics', chapter: 'Class 12 – Electric Charges & Fields / Potential', highYield: true,
    keys: ['electric charge', 'coulomb', 'electric field', 'electric potential', 'capacitor', 'capacitance',
           'dielectric', 'gauss', 'electric flux', 'electric dipole', 'equipotential'] },
  { topic: 'Current Electricity', chapter: 'Class 12 – Current Electricity', highYield: true,
    keys: ['electric current', 'resistance', 'ohm\'s law', 'kirchhoff', 'wheatstone', 'meter bridge', 'potentiometer',
           'drift velocity', 'resistivity', 'internal resistance', 'emf of a cell'] },
  { topic: 'Magnetic Effects of Current', chapter: 'Class 12 – Moving Charges and Magnetism', highYield: true,
    keys: ['magnetic field', 'lorentz force', 'cyclotron', 'solenoid', 'biot-savart', 'ampere\'s law',
           'galvanometer', 'moving charge', 'toroid', 'magnetic force on a wire'] },
  { topic: 'Magnetism & Matter', chapter: 'Class 12 – Magnetism and Matter',
    keys: ['magnetic dipole moment', 'diamagnetic', 'paramagnetic', 'ferromagnetic', 'hysteresis', 'magnetisation',
           'magnetic susceptibility', 'earth\'s magnetic field'] },
  { topic: 'Electromagnetic Induction', chapter: 'Class 12 – Electromagnetic Induction',
    keys: ['electromagnetic induction', 'faraday', 'lenz', 'self inductance', 'mutual inductance', 'eddy current',
           'magnetic flux', 'induced emf', 'motional emf'] },
  { topic: 'Alternating Current', chapter: 'Class 12 – Alternating Current',
    keys: ['alternating current', 'reactance', 'impedance', 'lcr circuit', 'resonant frequency', 'transformer',
           'rms current', 'power factor', 'wattless current', 'quality factor'] },
  { topic: 'Electromagnetic Waves', chapter: 'Class 12 – Electromagnetic Waves',
    keys: ['electromagnetic wave', 'displacement current', 'gamma-ray', 'x-ray', 'microwave', 'infra-red',
           'ultraviolet', 'em wave', 'electromagnetic spectrum'] },
  { topic: 'Ray Optics', chapter: 'Class 12 – Ray Optics and Optical Instruments', highYield: true,
    keys: ['convex lens', 'concave mirror', 'refraction', 'total internal reflection', 'prism', 'focal length',
           'magnification', 'refractive index', 'compound microscope', 'astronomical telescope', 'lens maker'] },
  { topic: 'Wave Optics', chapter: 'Class 12 – Wave Optics',
    keys: ['interference', 'diffraction', 'young\'s double slit', 'fringe width', 'polarisation', 'huygens',
           'coherent source', 'brewster', 'malus'] },
  { topic: 'Dual Nature of Matter', chapter: 'Class 12 – Dual Nature of Radiation and Matter', highYield: true,
    keys: ['photoelectric', 'photon', 'work function', 'de broglie', 'threshold frequency', 'stopping potential',
           'einstein\'s photoelectric', 'matter wave'] },
  { topic: 'Atoms', chapter: 'Class 12 – Atoms',
    keys: ['bohr model', 'hydrogen spectrum', 'lyman', 'balmer', 'paschen', 'rydberg', 'energy level',
           'ionisation energy of hydrogen', 'rutherford', 'spectral line'] },
  { topic: 'Nuclei', chapter: 'Class 12 – Nuclei',
    keys: ['radioactivity', 'alpha decay', 'beta decay', 'gamma decay', 'half-life', 'binding energy', 'mass defect',
           'nuclear fission', 'nuclear fusion', 'radioactive decay'] },
  { topic: 'Semiconductor Electronics', chapter: 'Class 12 – Semiconductor Electronics', highYield: true,
    keys: ['semiconductor', 'p-n junction', 'diode', 'transistor', 'rectifier', 'logic gate', 'zener',
           'forward bias', 'reverse bias', 'doping', 'depletion region'] },
];

/** @type {ChapterMap[]} */
const CHEMISTRY_MAP = [
  { topic: 'Mole Concept & Stoichiometry', chapter: 'Class 11 – Some Basic Concepts of Chemistry', highYield: true,
    keys: ['mole concept', 'molar mass', 'stoichiometry', 'empirical formula', 'limiting reagent', 'molarity',
           'molality', 'avogadro number', 'percentage composition', 'equivalent weight'] },
  { topic: 'Structure of Atom', chapter: 'Class 11 – Structure of Atom',
    keys: ['quantum number', 'atomic orbital', 'aufbau', 'hund\'s rule', 'pauli', 'electronic configuration',
           'heisenberg', 'de broglie wavelength', 'schrodinger', 'orbital angular momentum'] },
  { topic: 'Chemical Bonding', chapter: 'Class 11 – Chemical Bonding and Molecular Structure', highYield: true,
    keys: ['covalent bond', 'ionic bond', 'hybridisation', 'vsepr', 'dipole moment', 'molecular orbital',
           'bond order', 'hydrogen bond', 'sigma bond', 'pi bond', 'formal charge', 'sp3'] },
  { topic: 'States of Matter', chapter: 'Class 11 – States of Matter (Gases and Liquids)',
    keys: ['boyle\'s law', 'charles\'s law', 'ideal gas equation', 'van der waals', 'compressibility factor',
           'critical temperature', 'gay-lussac', 'partial pressure'] },
  { topic: 'Chemical Thermodynamics', chapter: 'Class 11 – Thermodynamics', highYield: true,
    keys: ['enthalpy', 'entropy change', 'gibbs free energy', 'spontaneity', 'hess\'s law', 'bond enthalpy',
           'standard enthalpy', 'heat of formation', 'exothermic', 'endothermic'] },
  { topic: 'Equilibrium', chapter: 'Class 11 – Equilibrium', highYield: true,
    keys: ['equilibrium constant', 'le chatelier', 'kp', 'kc', 'ph of', 'buffer solution', 'solubility product',
           'ksp', 'ionic product', 'henderson', 'common ion effect', 'degree of dissociation'] },
  { topic: 'Redox Reactions', chapter: 'Class 11 – Redox Reactions',
    keys: ['oxidation number', 'oxidation state', 'redox reaction', 'oxidising agent', 'reducing agent',
           'disproportionation', 'balancing redox'] },
  { topic: 'Electrochemistry', chapter: 'Class 12 – Electrochemistry', highYield: true,
    keys: ['electrochemical cell', 'electrode potential', 'nernst', 'galvanic cell', 'electrolysis', 'molar conductivity',
           'kohlrausch', 'faraday\'s law', 'salt bridge', 'standard hydrogen electrode', 'fuel cell'] },
  { topic: 'Chemical Kinetics', chapter: 'Class 12 – Chemical Kinetics', highYield: true,
    keys: ['rate of reaction', 'order of reaction', 'rate constant', 'arrhenius', 'activation energy', 'molecularity',
           'half-life of reaction', 'pseudo first order', 'rate law'] },
  { topic: 'Solutions', chapter: 'Class 12 – Solutions', highYield: true,
    keys: ['mole fraction', 'raoult', 'colligative', 'osmotic pressure', 'elevation in boiling point',
           'depression in freezing point', 'van\'t hoff factor', 'ideal solution', 'azeotrope'] },
  { topic: 'Solid State', chapter: 'Class 12 – The Solid State',
    keys: ['unit cell', 'crystal lattice', 'packing efficiency', 'body centred', 'face centred', 'coordination number',
           'schottky defect', 'frenkel defect', 'bravais'] },
  { topic: 'Periodic Classification', chapter: 'Class 11 – Classification of Elements and Periodicity',
    keys: ['periodic table', 'periodicity', 'atomic radius', 'ionisation enthalpy', 'electronegativity',
           'electron affinity', 'periodic trend', 'diagonal relationship'] },
  { topic: 's-Block Elements', chapter: 'Class 11 – The s-Block Elements',
    keys: ['alkali metal', 'alkaline earth', 'sodium hydroxide', 'washing soda', 'plaster of paris', 'quick lime',
           'lithium', 'caesium', 'diagonal relationship of lithium'] },
  { topic: 'p-Block Elements', chapter: 'Class 11–12 – The p-Block Elements', highYield: true,
    keys: ['boron family', 'carbon family', 'nitrogen family', 'oxygen family', 'halogen', 'noble gas',
           'interhalogen', 'allotrope', 'diborane', 'ozone', 'inert pair effect', 'oxoacid'] },
  { topic: 'd- and f-Block Elements', chapter: 'Class 12 – The d- and f-Block Elements',
    keys: ['transition element', 'lanthanide', 'actinide', 'lanthanoid contraction', 'coloured ion',
           'variable oxidation state', 'interstitial compound', 'potassium dichromate', 'potassium permanganate'] },
  { topic: 'Coordination Compounds', chapter: 'Class 12 – Coordination Compounds', highYield: true,
    keys: ['coordination compound', 'ligand', 'chelate', 'crystal field', 'werner', 'coordination number of',
           'spectrochemical series', 'linkage isomerism', 'denticity', 'ambidentate'] },
  { topic: 'Metallurgy', chapter: 'Class 12 – General Principles of Isolation of Elements',
    keys: ['metallurgy', 'roasting', 'calcination', 'froth flotation', 'smelting', 'ellingham', 'zone refining',
           'concentration of ore', 'gangue', 'leaching'] },
  { topic: 'General Organic Chemistry', chapter: 'Class 11 – Organic Chemistry: Basic Principles', highYield: true,
    keys: ['inductive effect', 'hyperconjugation', 'electrophile', 'nucleophile', 'carbocation', 'carbanion',
           'free radical', 'iupac name', 'resonance structure', 'homolytic', 'heterolytic'] },
  { topic: 'Hydrocarbons', chapter: 'Class 11 – Hydrocarbons',
    keys: ['alkane', 'alkene', 'alkyne', 'aromatic', 'benzene', 'markovnikov', 'ozonolysis', 'wurtz reaction',
           'friedel-crafts', 'huckel', 'saytzeff'] },
  { topic: 'Haloalkanes & Haloarenes', chapter: 'Class 12 – Haloalkanes and Haloarenes',
    keys: ['haloalkane', 'haloarene', 'sn1', 'sn2', 'grignard', 'alkyl halide', 'aryl halide', 'nucleophilic substitution'] },
  { topic: 'Alcohols, Phenols & Ethers', chapter: 'Class 12 – Alcohols, Phenols and Ethers',
    keys: ['alcohol', 'phenol', 'esterification', 'williamson synthesis', 'kolbe', 'reimer-tiemann', 'lucas test'] },
  { topic: 'Aldehydes, Ketones & Acids', chapter: 'Class 12 – Aldehydes, Ketones and Carboxylic Acids', highYield: true,
    keys: ['aldehyde', 'ketone', 'carbonyl', 'aldol', 'cannizzaro', 'tollens', 'fehling', 'carboxylic acid',
           'hell-volhard', 'clemmensen', 'wolff-kishner'] },
  { topic: 'Amines', chapter: 'Class 12 – Amines',
    keys: ['amine', 'diazonium', 'hofmann', 'aniline', 'carbylamine', 'gabriel', 'coupling reaction'] },
  { topic: 'Biomolecules (Chemistry)', chapter: 'Class 12 – Biomolecules',
    keys: ['glycosidic', 'reducing sugar', 'anomer', 'zwitter ion', 'peptide linkage', 'essential amino acid',
           'vitamin deficiency', 'nucleoside', 'denaturation of protein'] },
  { topic: 'Polymers', chapter: 'Class 12 – Polymers',
    keys: ['polymerisation', 'nylon', 'teflon', 'bakelite', 'buna', 'condensation polymer', 'addition polymer',
           'biodegradable polymer', 'natural rubber'] },
  { topic: 'Chemistry in Everyday Life', chapter: 'Class 12 – Chemistry in Everyday Life',
    keys: ['antibiotic', 'analgesic', 'antiseptic', 'detergent', 'antacid', 'food preservative', 'artificial sweetener',
           'antihistamine'] },
];

/** All maps keyed by canonical subject name. Iteration order is fixed. */
const KEYWORD_MAPS = { Biology: BIOLOGY_MAP, Physics: PHYSICS_MAP, Chemistry: CHEMISTRY_MAP };

/** Canonical subject order used whenever we scan across every subject. */
const SUBJECT_ORDER = ['Biology', 'Physics', 'Chemistry'];

/** Set of topic names flagged high-yield, used to prioritise recommendations. */
const HIGH_YIELD_TOPICS = (() => {
  const s = new Set();
  for (const subj of SUBJECT_ORDER) {
    for (const entry of KEYWORD_MAPS[subj]) if (entry.highYield) s.add(entry.topic);
  }
  return s;
})();

// ── Small pure helpers ──────────────────────────────────────────────────────

/**
 * Map any casing / partial subject string to a canonical subject name.
 * @param {*} s
 * @returns {('Biology'|'Physics'|'Chemistry')|null}
 */
function normalizeSubject(s) {
  if (typeof s !== 'string') return null;
  const v = s.trim().toLowerCase();
  if (v.startsWith('bio')) return 'Biology';
  if (v.startsWith('phy')) return 'Physics';
  if (v.startsWith('chem')) return 'Chemistry';
  return null;
}

/**
 * First chapter entry in `map` whose keyword appears in `text`, or null.
 * @param {string} text lower-cased question text
 * @param {ChapterMap[]} map
 * @returns {ChapterMap|null}
 */
function matchInMap(text, map) {
  for (const entry of map) {
    for (const k of entry.keys) {
      if (text.includes(k)) return entry;
    }
  }
  return null;
}

/** Round to nearest integer percent. @param {number} c @param {number} t */
function pctOf(c, t) {
  return t > 0 ? Math.round((c / t) * 100) : 0;
}

// ── topicFor ────────────────────────────────────────────────────────────────

/**
 * Resolve a question to its subject / chapter for grouping.
 *
 * Resolution order:
 *   1. If question.question_metadata.topic is a non-empty string, trust it
 *      (subject from question.subject, chapter from metadata.chapter or the topic).
 *   2. Otherwise infer by keyword-matching question.question.text (lower-cased):
 *      the declared subject's map is searched first, then the remaining subjects,
 *      so a mis-labelled item (e.g. a Physics question tagged "Biology") still
 *      lands in the correct chapter.
 *   3. Otherwise fall back to { subject: <declared or 'General'>, topic:'General', chapter:'General' }.
 *
 * @param {object} question a quiz question object
 * @returns {{subject:string, topic:string, chapter:string}}
 */
export function topicFor(question) {
  const q = question || {};
  const meta = q.question_metadata || {};
  const declared = normalizeSubject(q.subject);

  // 1. Explicit metadata topic wins.
  if (typeof meta.topic === 'string' && meta.topic.trim()) {
    const topic = meta.topic.trim();
    const chapter = (typeof meta.chapter === 'string' && meta.chapter.trim()) ? meta.chapter.trim() : topic;
    return { subject: declared || 'General', topic, chapter };
  }

  // 2. Infer from question text.
  const text = ((q.question && typeof q.question.text === 'string') ? q.question.text : '').toLowerCase();
  if (text) {
    // Search declared subject first, then the rest in canonical order.
    const order = declared
      ? [declared, ...SUBJECT_ORDER.filter((s) => s !== declared)]
      : SUBJECT_ORDER;
    for (const subj of order) {
      const hit = matchInMap(text, KEYWORD_MAPS[subj]);
      if (hit) return { subject: subj, topic: hit.topic, chapter: hit.chapter };
    }
  }

  // 3. Nothing matched.
  return { subject: declared || 'General', topic: 'General', chapter: 'General' };
}

// ── SM-2-lite spaced repetition ──────────────────────────────────────────────

/**
 * Deterministic SM-2-lite grade for a single answer.
 *   skipped            -> 0 (no recall)
 *   wrong (attempted)  -> 2 (fail, but engaged)
 *   correct + slow     -> 3
 *   correct + normal   -> 4
 *   correct + fast     -> 5
 * "fast/normal/slow" is timeTaken vs the question's estimated time (default 60s):
 *   <= 50% -> fast, <= 100% -> normal, otherwise slow. Missing timeTaken -> normal.
 * @param {{correct?:boolean, skipped?:boolean, timeTaken?:number}} ans
 * @param {object|undefined} question
 * @returns {0|2|3|4|5}
 */
function gradeFor(ans, question) {
  if (ans.skipped) return 0;
  if (ans.correct !== true) return 2;
  const est = (question && question.learning && Number(question.learning.estimated_time_seconds)) || 60;
  const t = Number(ans.timeTaken);
  if (!Number.isFinite(t) || t <= 0) return 4; // no timing info -> treat as normal
  if (t <= 0.5 * est) return 5;
  if (t <= est) return 4;
  return 3;
}

/**
 * Days until next review from an SM-2-lite grade. Wrong/skipped reset to 1 day;
 * correct answers earn a progressively longer interval as the grade rises.
 * @param {number} grade
 * @returns {number}
 */
function intervalForGrade(grade) {
  switch (grade) {
    case 5: return 6;
    case 4: return 4;
    case 3: return 2;
    default: return 1; // grades 0–2: review tomorrow
  }
}

// ── analyze ──────────────────────────────────────────────────────────────────

/**
 * Aggregate a completed attempt into per-subject / per-topic performance,
 * weak-topic flags, study recommendations and an SM-2-lite review schedule.
 *
 * Deterministic: no clocks, no randomness. `nextReviewInDays` is a relative
 * offset (add it to "today" at the call site) so the output never depends on
 * when analyze() runs.
 *
 * @param {Array<{questionId:*, selected?:*, correct?:boolean, skipped?:boolean, timeTaken?:number}>} answers
 * @param {Array<object>} questions the quiz question objects (joined by id)
 * @returns {{
 *   bySubject: Object.<string,{correct:number,total:number,pct:number}>,
 *   byTopic: Array<{subject:string, topic:string, correct:number, total:number, pct:number}>,
 *   weakTopics: Array<{subject:string, topic:string, pct:number}>,
 *   recommendations: Array<{subject:string, topic:string, reason:string}>,
 *   srs: Array<{questionId:*, grade:number, nextReviewInDays:number}>
 * }}
 */
export function analyze(answers, questions) {
  const ans = Array.isArray(answers) ? answers : [];
  const qs = Array.isArray(questions) ? questions : [];

  // Join questions by id.
  const byId = new Map();
  for (const q of qs) {
    if (q && q.id != null) byId.set(q.id, q);
  }

  const subjectAgg = {}; // subject -> { correct, total }
  const topicAgg = new Map(); // "subject topic" -> { subject, topic, chapter, correct, total }
  const srs = [];

  for (const a of ans) {
    const question = byId.get(a.questionId);
    const { subject, topic, chapter } = topicFor(question);
    const isCorrect = !a.skipped && a.correct === true;

    // Per-subject
    if (!subjectAgg[subject]) subjectAgg[subject] = { correct: 0, total: 0 };
    subjectAgg[subject].total++;
    if (isCorrect) subjectAgg[subject].correct++;

    // Per-topic
    const key = subject + ' ' + topic;
    let g = topicAgg.get(key);
    if (!g) { g = { subject, topic, chapter, correct: 0, total: 0 }; topicAgg.set(key, g); }
    g.total++;
    if (isCorrect) g.correct++;

    // SRS entry (deterministic, in answer order)
    const grade = gradeFor(a, question);
    srs.push({ questionId: a.questionId, grade, nextReviewInDays: intervalForGrade(grade) });
  }

  // bySubject with pct
  const bySubject = {};
  for (const s of Object.keys(subjectAgg)) {
    const { correct, total } = subjectAgg[s];
    bySubject[s] = { correct, total, pct: pctOf(correct, total) };
  }

  // byTopic, sorted worst pct first (stable tie-breaks: larger sample, then name)
  const byTopic = Array.from(topicAgg.values()).map((g) => ({
    subject: g.subject,
    topic: g.topic,
    chapter: g.chapter,
    correct: g.correct,
    total: g.total,
    pct: pctOf(g.correct, g.total),
  }));
  byTopic.sort((a, b) =>
    (a.pct - b.pct) ||
    (b.total - a.total) ||
    (a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0) ||
    (a.topic < b.topic ? -1 : a.topic > b.topic ? 1 : 0));

  // weakTopics: pct < 60, at least 2 attempts. Inherits worst-first order.
  const weakTopics = byTopic
    .filter((t) => t.total >= 2 && t.pct < 60)
    .map((t) => ({ subject: t.subject, topic: t.topic, pct: t.pct }));

  // recommendations: weak topics first, then under-performing high-yield topics.
  const recommendations = [];
  const seen = new Set();
  for (const t of byTopic) {
    if (t.total >= 2 && t.pct < 60) {
      recommendations.push({
        subject: t.subject,
        topic: t.topic,
        reason: `Weak area — scored ${t.pct}% (${t.correct}/${t.total}). Revise ${t.chapter} and redo the questions you missed.`,
      });
      seen.add(t.subject + ' ' + t.topic);
    }
  }
  for (const t of byTopic) {
    const key = t.subject + ' ' + t.topic;
    if (seen.has(key)) continue;
    if (HIGH_YIELD_TOPICS.has(t.topic) && t.total >= 1 && t.pct < 75) {
      recommendations.push({
        subject: t.subject,
        topic: t.topic,
        reason: `High-yield NEET topic at ${t.pct}% (${t.correct}/${t.total}) — a frequent scorer; tighten ${t.chapter} to bank easy marks.`,
      });
      seen.add(key);
    }
  }

  // Strip the internal `chapter` field from the public byTopic rows.
  const byTopicPublic = byTopic.map((t) => ({
    subject: t.subject, topic: t.topic, correct: t.correct, total: t.total, pct: t.pct,
  }));

  return { bySubject, byTopic: byTopicPublic, weakTopics, recommendations, srs };
}

/** Default bundle so callers can `import feedback from './feedback.js?v=1784611432079'`. */
export default { topicFor, analyze };
