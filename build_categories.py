"""Build plastics_fluids_by_category.csv with 30+ meaningful categories."""
import csv, re
from collections import Counter

def m(name, keywords):
    """Case-insensitive substring match on any keyword."""
    n = name.lower()
    return any(k.lower() in n for k in keywords)

def rx(name, patterns):
    """Regex match any pattern against the lowercased name."""
    n = name.lower()
    return any(re.search(p, n) for p in patterns)

# ---------------------------------------------------------------
# Category list — first match wins.
# Each entry: (category_label, keyword_list_or_function)
# ---------------------------------------------------------------
CATEGORIES = [
    # ── Acids ──────────────────────────────────────────────────
    ('Acids – Inorganic',
     lambda n: rx(n, [r'sulfuric acid',r'sulphuric acid',r'hydrochloric acid',r'nitric acid',
                       r'phosphoric acid',r'hydrofluoric acid',r'hydriodic acid',r'hydrobromic acid',
                       r'perchloric acid',r'chromic acid',r'silicic acid',r'boric acid',
                       r'sulfurous acid',r'nitrous acid',r'chlorosulfuric',r'chlorosulfonic',
                       r'tetrafluoroboric',r'hypochlorous acid'])),

    ('Acids – Organic',
     lambda n: rx(n, [r'acetic acid',r'formic acid',r'propionic acid',r'butyric acid',
                       r'lactic acid',r'citric acid',r'oxalic acid',r'benzoic acid',r'tartaric acid',
                       r'stearic acid',r'oleic acid',r'palmitic acid',r'valeric acid',r'caproic acid',
                       r'caprylic acid',r'capric acid',r'acrylic acid',r'methacrylic acid',
                       r'chloroacetic acid',r'dichloroacetic',r'trifluoroacetic',r'gluconic acid',
                       r'peracetic acid',r'succinic acid',r'maleic acid',r'fumaric acid',
                       r'adipic acid',r'phthalic acid',r'isophthalic',r'terephthalic',
                       r'salicylic acid',r'mandelic acid',r'pyruvic acid',r'glyoxylic',
                       r'acetylsalicylic',r'trichloroacetic',r'malic acid',r'glycolic acid',
                       r'uronic acid',r'sorbic acid',r'cinnamic acid'])),

    ('Acid Anhydrides & Acid Chlorides',
     lambda n: rx(n, [r'anhydride',r'acid chloride',r'acid fluoride',r'acetyl chloride',
                       r'propionyl chloride',r'benzoyl chloride',r'thionyl chloride',
                       r'acetic anhydride',r'propionic anhydride',r'maleic anhydride',
                       r'phthalic anhydride'])),

    # ── Alcohols ────────────────────────────────────────────────
    ('Alcohols – Simple',
     lambda n: rx(n, [r'methanol',r'ethanol',r'\bpropanol\b',r'isopropanol',r'butanol',
                       r'isobutanol',r'pentanol',r'hexanol',r'octanol',r'decanol',r'dodecanol',
                       r'cyclohexanol',r'furfuryl alcohol',r'benzyl alcohol',r'allyl alcohol',
                       r'propargyl alcohol',r'\bIPA\b'])
             or (rx(n, [r'alcohol']) and not rx(n, [r'polyvinyl alcohol', r'pva']))),

    ('Glycols & Polyols',
     lambda n: rx(n, [r'ethylene glycol',r'propylene glycol',r'diethylene glycol',
                       r'triethylene glycol',r'polyethylene glycol',r'\bpeg\b',
                       r'polypropylene glycol',r'glycerol',r'glycerin',r'hexanetriol',
                       r'sorbitol',r'mannitol',r'pentaerythritol',r'xylitol',
                       r'neopentyl glycol',r'1,3-propanediol',r'1,4-butanediol',
                       r'1,6-hexanediol',r'diethylene glycolether',r'glycolether'])),

    # ── Aldehydes ───────────────────────────────────────────────
    ('Aldehydes',
     lambda n: rx(n, [r'aldehyde',r'furfural',r'formaldehyde',r'glutaraldehyde',
                       r'crotonaldehyde',r'propionaldehyde',r'butyraldehyde',r'benzaldehyde',
                       r'acrolein',r'cinnamaldehyde',r'decanal'])),

    # ── Ketones ─────────────────────────────────────────────────
    ('Ketones',
     lambda n: rx(n, [r'ketone',r'\bacetone\b',r'methyl ethyl ketone',r'\bmek\b',
                       r'\bmibk\b',r'cyclohexanone',r'acetophenone',r'methyl isobutyl ketone',
                       r'methyl isopropyl ketone',r'diacetone',r'mesityl oxide',
                       r'methyl vinyl ketone',r'isophorone'])),

    # ── Esters ──────────────────────────────────────────────────
    ('Esters',
     lambda n: rx(n, [r'ethyl acetate',r'butyl acetate',r'methyl acetate',r'propyl acetate',
                       r'isopropyl acetate',r'amyl acetate',r'vinyl acetate',r'hexyl acetate',
                       r'octyl acetate',r'ethyl formate',r'methyl formate',r'ethyl lactate',
                       r'methyl acrylate',r'ethyl acrylate',r'butyl acrylate',r'methyl benzoate',
                       r'dioctyl phthalate',r'\bdop\b',r'dibutyl phthalate',r'\bdbp\b',
                       r'diethyl phthalate',r'\bdep\b',r'glycol diacetate',r'diethyl carbonate',
                       r'ethylene carbonate',r'propylene carbonate',r'allyl acetate',
                       r'ethyl acetoacetate',r'glycol diacrylate',r'trimethylolpropane',
                       r'pentyl acetate',r'isoamyl acetate',r'butyl butyrate',
                       r'phosphate ester',r'triethyl phosphate',r'tributyl phosphate',
                       r'triphenyl phosphate'])),

    # ── Ethers ──────────────────────────────────────────────────
    ('Ethers',
     lambda n: rx(n, [r'diethyl ether',r'dipropyl ether',r'dibutyl ether',r'dioxane',
                       r'tetrahydrofuran',r'\bthf\b',r'oxetane',r'\bfuran\b',r'diglyme',
                       r'cellosolve',r'carbitol',r'methoxypropanol',r'ethoxyethanol',
                       r'butoxyethanol',r'diisopropyl ether',r'methyl tertiary butyl ether',
                       r'\bmtbe\b',r'dioxolane',r'trioxane',r'ethylene oxide',r'propylene oxide',
                       r'epichlorohydrin',r'tetrahydropyran',r'phenyl ether',r'anisole',
                       r'methoxybenzene',r'diphenyl ether',r'diethylene glycolether',
                       r'glycol monobutyl ether',r'methyl glycol',r'butyl glycol'])),

    # ── Aromatics ───────────────────────────────────────────────
    ('Aromatics',
     lambda n: rx(n, [r'\bbenzene\b',r'\btoluene\b',r'\bxylene\b',r'\bcumene\b',
                       r'\bnaphthalene\b',r'\bnitrobenzene\b',r'mesitylene',r'\bindene\b',
                       r'tetralin',r'decalin',r'anthracene',r'pyrene',r'\bstyrene\b',
                       r'ethylbenzene',r'diethylbenzene',r'isopropylbenzene'])),

    # ── Phenols ─────────────────────────────────────────────────
    ('Phenols & Cresols',
     lambda n: rx(n, [r'\bphenol\b',r'\bcresol\b',r'catechol',r'resorcinol',r'hydroquinone',
                       r'bisphenol',r'naphthol',r'xylenol',r'thymol',r'guaiacol',r'eugenol',
                       r'pyrogallol',r'phloroglucinol'])),

    # ── Amines / Amides / N-compounds ───────────────────────────
    ('Amines & Amides',
     lambda n: rx(n, [r'\bamine\b',r'\bamide\b',r'acetamide',r'dimethylamine',
                       r'triethylamine',r'diethanolamine',r'triethanolamine',r'ethylenediamine',
                       r'\bhydrazine\b',r'\baniline\b',r'pyridine',r'morpholine',
                       r'caprolactam',r'\blactam\b',r'formamide',r'toluidine',r'benzylamine',
                       r'cyclohexylamine',r'diethylamine',r'butylamine',r'hexylamine',
                       r'octylamine',r'dimethylformamide',r'\bdmf\b',r'dimethylacetamide',
                       r'aminoethanol',r'amino alcohol',r'ethanolamine'])),

    ('Nitrile & Cyanide Compounds',
     lambda n: rx(n, [r'\bnitrile\b',r'\bcyanide\b',r'acetonitrile',r'propionitrile',
                       r'acrylonitrile',r'butyronitrile',r'benzonitrile',r'hydrogen cyanide',
                       r'sodium cyanide',r'potassium cyanide'])),

    ('Nitro Compounds',
     lambda n: rx(n, [r'nitromethane',r'nitroethane',r'nitropropane',r'nitroglycerin',
                       r'nitrotoluene',r'nitroaniline',r'nitrocellulose',r'nitrogen mustard'])),

    # ── Chlorinated ─────────────────────────────────────────────
    ('Chlorinated Solvents',
     lambda n: rx(n, [r'chloroform',r'dichloromethane',r'methylene chloride',
                       r'trichloroethylene',r'tetrachloroethylene',r'dichloroethane',
                       r'perchloroethylene',r'trichloroethane',r'carbon tetrachloride',
                       r'dichloropropane',r'tetrachloroethane',r'pentachloroethane'])),

    # ── Fluorocarbons ───────────────────────────────────────────
    ('Fluorocarbons & Refrigerants',
     lambda n: rx(n, [r'\bfreon\b',r'frigen',r'\br-113\b',r'\br-12\b',r'\br-11\b',r'\br-22\b',
                       r'chlorodifluoro',r'trichlorofluoro',r'perfluorocyclobutane',
                       r'chlorotrifluoro',r'hexafluoro',r'r-134',r'r-123',
                       r'difluoromethane',r'perfluoro',r'fluorocarbon'])),

    # ── Aliphatic solvents ──────────────────────────────────────
    ('Aliphatic Hydrocarbons',
     lambda n: rx(n, [r'\bhexane\b',r'\bheptane\b',r'\boctane\b',r'\bdecane\b',r'\bpentane\b',
                       r'isooctane',r'\bcyclohexane\b',r'cyclopentane',r'petroleum ether',
                       r'ligroin',r'isohexane',r'methylcyclohexane',r'\bnonane\b',r'\bundecane\b',
                       r'\bdodecane\b',r'\btetradecane\b',r'\bhexadecane\b',r'\boctadecane\b',
                       r'\beicosane\b'])),

    # ── Fuels ───────────────────────────────────────────────────
    ('Diesel, Fuel Oils & Kerosene',
     lambda n: rx(n, [r'\bdiesel\b',r'heating oil',r'fuel oil',r'\bkerosene\b',r'jet fuel',
                       r'aviation fuel',r'white spirit',r'\bnaphtha\b',r'\bpetrol\b',
                       r'\bgasoline\b',r'\bbenzin\b',r'unleaded',r'light oil',r'mineral spirits',
                       r'stoddard'])),

    # ── Oils ────────────────────────────────────────────────────
    ('Natural Oils, Fats & Waxes',
     lambda n: rx(n, [r'sunflower oil',r'soya oil',r'olive oil',r'corn oil',r'peanut oil',
                       r'castor oil',r'linseed oil',r'coconut oil',r'palm oil',r'rapeseed',
                       r'tung oil',r'fish oil',r'\blanolin\b',r'\btallow\b',r'beeswax',
                       r'candle wax',r'carnauba',r'\bparaffin\b',r'\bvaseline\b',
                       r'petroleum jelly',r'\bpetrolatum\b',r'almond oil',r'eucalyptus oil',
                       r'camphor oil',r'rosemary oil',r'peppermint oil',r'turpentine',
                       r'balsa\b',r'\blard\b',r'margarine',r'rapeseed oil',r'cottonseed oil'])),

    ('Hydraulic & Lubricating Oils',
     lambda n: rx(n, [r'hydraulic oil',r'lubricat',r'gear oil',r'turbine oil',
                       r'compressor oil',r'mineral oil',r'transformer oil',r'engine oil',
                       r'motor oil',r'machine oil',r'cutting oil',r'quenching oil',
                       r'synthetic oil',r'spindle oil'])),

    # ── Inorganic ───────────────────────────────────────────────
    ('Inorganic Alkalis & Bases',
     lambda n: rx(n, [r'sodium hydroxide',r'potassium hydroxide',r'calcium hydroxide',
                       r'ammonia solution',r'ammonium hydroxide',r'barium hydroxide',
                       r'lithium hydroxide',r'sodium carbonate',r'potassium carbonate',
                       r'\blye\b',r'caustic soda',r'caustic potash',r'slaked lime',
                       r'quicklime'])),

    ('Inorganic Salts',
     lambda n: rx(n, [
         r'chloride',r'sulfate',r'sulphate',r'nitrate',r'carbonate',r'bicarbonate',
         r'phosphate',r'hydroxide',r'bromide',r'iodide',r'silicate',
         r'fluoride',r'chromate',r'dichromate',r'permanganate',r'hypochlorite',
         r'thiosulfate',r'alumin',r'ammonium acetate',r'ammonium bisulfide',
         r'ammonium carbonate',r'ammonium difluoride',r'ammonium ferric',
         r'ammonium fluoride',r'ammonium glycolate',r'ammonium heptamolybdate',
         r'ammonium nitrite',r'ammonium oxalate',r'ammonium phosphate',
         r'ammonium thiocyanate',r'ammonium tungstate',r'ferrous',r'ferric',
         r'zinc acetate',r'copper acetate',r'mercuric',r'mercury',r'lead',
         r'cadmium',r'chromium',r'nickel sulfate',r'cobalt chloride'])),

    # ── Bleaches ────────────────────────────────────────────────
    ('Bleaches & Oxidizers',
     lambda n: rx(n, [r'hypochlorite',r'bleach',r'permanganate',r'chlorine water',
                       r'hydrogen peroxide',r'\bozone\b',r'persulfate',r'peracetic acid',
                       r'sodium chlorite',r'chlorine dioxide',r'sodium perborate',
                       r'calcium hypochlorite',r'potassium permanganate'])),

    # ── Gases ───────────────────────────────────────────────────
    ('Gases (dissolved or liquefied)',
     lambda n: rx(n, [r'\bchlorine\b',r'ammonia gas',r'carbon dioxide',r'sulfur dioxide',
                       r'hydrogen sulfide',r'hydrogen chloride',r'hydrogen fluoride',
                       r'\boxygen\b',r'\bnitrogen\b',r'\bxenon\b',r'\bargon\b',r'\bhelium\b',
                       r'\bozone\b',r'nitrous oxide',r'\bhydrogen\b',r'\bacetylene\b',
                       r'\bmethane\b',r'\bpropane\b',r'\bbutane\b',r'exhaust gas',
                       r'flue gas',r'chlorine gas',r'nitrose gas',r'nitrogen oxide',
                       r'carbon monoxide',r'sulfur trioxide',r'bromine steam',
                       r'nitrogen dioxide'])),

    # ── Surfactants ─────────────────────────────────────────────
    ('Cleaning Agents & Surfactants',
     lambda n: rx(n, [r'detergent',r'\bsoap\b',r'soapy',r'cleaning agent',r'dishwash',
                       r'laundry',r'surfactant',r'\btriton\b',r'\btween\b',r'\bspan\b',
                       r'wetting agent',r'emulsifier',r'sodium dodecyl',r'sodium lauryl',
                       r'alkyl sulfonate'])),

    # ── Cooling/antifreeze ──────────────────────────────────────
    ('Coolants & Antifreeze',
     lambda n: rx(n, [r'antifreeze',r'coolant'])),

    # ── Fertilizers ─────────────────────────────────────────────
    ('Fertilizers & Agrochemicals',
     lambda n: rx(n, [r'fertilizer',r'\burea\b',r'ammonium nitrate',r'diammonium phosphate',
                       r'superphosphate',r'\bmanure\b',r'herbicide',r'pesticide',
                       r'insecticide',r'fungicide'])),

    # ── Silicones ───────────────────────────────────────────────
    ('Silicones & Silicates',
     lambda n: rx(n, [r'silicone',r'siloxane',r'dimethylsilicone',r'sodium silicate',
                       r'water glass',r'potassium silicate',r'colloidal silica',
                       r'silica gel',r'precipitated silica',r'silicon dioxide'])),

    # ── Sulfur compounds ────────────────────────────────────────
    ('Sulfur Compounds',
     lambda n: rx(n, [r'dimethyl sulfoxide',r'\bdmso\b',r'carbon disulfide',
                       r'\bthiophene\b',r'\bmercaptan\b',r'\bthiol\b',r'dimethyl sulfide',
                       r'diethyl sulfide',r'thioether',r'allyl mustard'])),

    # ── Beverages & food ────────────────────────────────────────
    ('Beverages & Food Products',
     lambda n: rx(n, [r'\bbeer\b',r'\bwine\b',r'\bmilk\b',r'\bjuice\b',r'\bcoffee\b',
                       r'\btea\b',r'\byeast\b',r'\bsugar\b',r'\bhoney\b',r'vinegar',
                       r'\bjam\b',r'\bsyrup\b',r'\bwort\b',r'\bfruit\b',r'molasse',
                       r'\bgelatin\b',r'\bstarch\b',r'\bwhey\b',r'\bblood\b',r'\blard\b',
                       r'margarine',r'\bfood\b',r'allspice',r'\bpickle',r'soy sauce',
                       r'mustard oil',r'glycerol.*food',r'beet juice',r'sugar beet'])),

    # ── Paints ──────────────────────────────────────────────────
    ('Paints, Coatings & Resins',
     lambda n: rx(n, [r'\bpaint\b',r'\blacquer\b',r'\bvarnish\b',r'\bresin\b',r'\bepoxy\b',
                       r'\balkyd\b',r'\bprimer\b',r'\bshellac\b',r'\bpolish\b'])),

    # ── Halogenated compounds (catch-all) ───────────────────────
    ('Halogenated Compounds',
     lambda n: rx(n, [r'\bbromine\b',r'\biodine\b',r'\bfluorine\b',r'allyl chloride',
                       r'allyl bromide',r'bromobenzene',r'iodobenzene',r'methyl iodide',
                       r'methyl bromide',r'ethyl chloride',r'propyl chloride',
                       r'allyl iodide',r'benzyl chloride',r'benzal chloride',
                       r'benzotrichloride'])),

    # ── Water & salt solutions ──────────────────────────────────
    ('Salt Solutions (Aqueous)',
     lambda n: rx(n, [r'\bbrine\b',r'\bsaline\b',r'sea water',r'seawater',r'salt water'])),

    ('Water & Aqueous Solutions',
     lambda n: rx(n, [r'distilled water',r'deminerali',r'tap water',r'drinking water',
                       r'deionized water',r'purified water',r'\bwater\b'])),

    # ── Phosphoric ──────────────────────────────────────────────
    ('Phosphorus Compounds',
     lambda n: rx(n, [r'phosphate ester',r'triethyl phosphate',r'tributyl phosphate',
                       r'triphenyl phosphate',r'phosphonate',r'phosphonate'])),
]

def assign(name):
    for cat, fn in CATEGORIES:
        if fn(name):
            return cat
    return None

with open('csvData/PlasticsCompatibilityTable.csv', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

names = sorted(set(r['Compound / Fluid'] for r in rows))

assignments = {}
unassigned = []
for name in names:
    cat = assign(name)
    if cat:
        assignments[name] = cat
    else:
        unassigned.append(name)

cat_counts = Counter(assignments.values())
print(f'Total unique names: {len(names)}')
print(f'Assigned: {len(assignments)} ({100*len(assignments)//len(names)}%)')
print(f'Unassigned: {len(unassigned)}')
print(f'Categories: {len(cat_counts)}')
print()
print('Category counts:')
for cat, count in sorted(cat_counts.items()):
    print(f'  {count:3d}  {cat}')
print()
print('Sample unassigned (first 20):')
for n in unassigned[:20]:
    print(f'  {n}')

# ── Write CSV ─────────────────────────────────────────────────────
with open('csvData/plastics_fluids_by_category.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerow(['Category', 'Fluid'])
    for name, cat in sorted(assignments.items(), key=lambda x: (x[1], x[0])):
        writer.writerow([cat, name])

print(f'\nWritten csvData/plastics_fluids_by_category.csv')
