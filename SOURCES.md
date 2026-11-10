# Источники

Все PMID и DOI ниже проверены 09.11.2026 скриптом `scripts/verify-sources.mjs`: PubMed E-utilities (`esummary`: год, название, DOI, авторы) и Crossref (DOI существует). Повторить: `npm run verify-sources`. Источник, который не удалось проверить, в базу советов не добавлялся.

> При подборе одна ссылка, вспомненная по памяти (PMID 25645314 для обзора о самовзвешивании), оказалась **чужой статьёй** и была заменена на проверенную PMID 25521523. Поэтому каждая ссылка проверяется автоматически.

## 1. Исследования в базе советов (`src/lib/advice/knowledge.json`)

| Ключ | Авторы, год | Название | Журнал | Тип | PMID | DOI | Правила |
|---|---|---|---|---|---|---|---|
| schoenfeld2017 | Schoenfeld BJ, Ogborn D, Krieger JW, 2017 | Dose-response relationship between weekly resistance training volume and increases in muscle mass: A systematic review and meta-analysis | J Sports Sci | Метаанализ | [27433992](https://pubmed.ncbi.nlm.nih.gov/27433992/) | [10.1080/02640414.2016.1210197](https://doi.org/10.1080/02640414.2016.1210197) | volume-low, volume-high |
| schoenfeld2016 | Schoenfeld BJ, Ogborn D, Krieger JW, 2016 | Effects of Resistance Training Frequency on Measures of Muscle Hypertrophy: A Systematic Review and Meta-Analysis | Sports Med | Метаанализ | [27102172](https://pubmed.ncbi.nlm.nih.gov/27102172/) | [10.1007/s40279-016-0543-8](https://doi.org/10.1007/s40279-016-0543-8) | frequency-low |
| garthe2011 | Garthe I, Raastad T, Refsnes PE, Koivisto A, Sundgot-Borgen J, 2011 | Effect of two different weight-loss rates on body composition and strength and power-related performance in elite athletes | Int J Sport Nutr Exerc Metab | РКИ | [21558571](https://pubmed.ncbi.nlm.nih.gov/21558571/) | [10.1123/ijsnem.21.2.97](https://doi.org/10.1123/ijsnem.21.2.97) | loss-too-fast |
| helms2014prep | Helms ER, Aragon AA, Fitschen PJ, 2014 | Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation | J Int Soc Sports Nutr | Обзор | [24864135](https://pubmed.ncbi.nlm.nih.gov/24864135/) | [10.1186/1550-2783-11-20](https://doi.org/10.1186/1550-2783-11-20) | loss-too-fast |
| helms2014protein | Helms ER, Zinn C, Rowlands DS, Brown SR, 2014 | A systematic review of dietary protein during caloric restriction in resistance trained lean athletes: a case for higher intakes | Int J Sport Nutr Exerc Metab | Систематический обзор | [24092765](https://pubmed.ncbi.nlm.nih.gov/24092765/) | [10.1123/ijsnem.2013-0054](https://doi.org/10.1123/ijsnem.2013-0054) | protein-low |
| morton2018 | Morton RW, Murphy KT, McKellar SR, et al., 2018 | A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults | Br J Sports Med | Метаанализ | [28698222](https://pubmed.ncbi.nlm.nih.gov/28698222/) | [10.1136/bjsports-2017-097608](https://doi.org/10.1136/bjsports-2017-097608) | protein-low |
| schoenfeld2018meal | Schoenfeld BJ, Aragon AA, 2018 | How much protein can the body use in a single meal for muscle-building? Implications for daily protein distribution | J Int Soc Sports Nutr | Обзор | [29497353](https://pubmed.ncbi.nlm.nih.gov/29497353/) | [10.1186/s12970-018-0215-1](https://doi.org/10.1186/s12970-018-0215-1) | protein-distribution |
| trexler2014 | Trexler ET, Smith-Ryan AE, Norton LE, 2014 | Metabolic adaptation to weight loss: implications for the athlete | J Int Soc Sports Nutr | Обзор | [24571926](https://pubmed.ncbi.nlm.nih.gov/24571926/) | [10.1186/1550-2783-11-7](https://doi.org/10.1186/1550-2783-11-7) | plateau |
| byrne2018 | Byrne NM, Sainsbury A, King NA, Hills AP, Wood RE, 2018 | Intermittent energy restriction improves weight loss efficiency in obese men: the MATADOR study | Int J Obes (Lond) | РКИ | [28925405](https://pubmed.ncbi.nlm.nih.gov/28925405/) | [10.1038/ijo.2017.206](https://doi.org/10.1038/ijo.2017.206) | plateau |
| murphy2022 | Murphy C, Koehler K, 2022 | Energy deficiency impairs resistance training gains in lean mass but not strength: A meta-analysis and meta-regression | Scand J Med Sci Sports | Метаанализ | [34623696](https://pubmed.ncbi.nlm.nih.gov/34623696/) | [10.1111/sms.14075](https://doi.org/10.1111/sms.14075) | strength-drop-cut |
| knowles2018 | Knowles OE, Drinkwater EJ, Urwin CS, Lamon S, Aisbett B, 2018 | Inadequate sleep and muscle strength: Implications for resistance training | J Sci Med Sport | Систематический обзор | [29422383](https://pubmed.ncbi.nlm.nih.gov/29422383/) | [10.1016/j.jsams.2018.01.012](https://doi.org/10.1016/j.jsams.2018.01.012) | strength-drop-cut |
| ashwell2012 | Ashwell M, Gunn P, Gibson S, 2012 | Waist-to-height ratio is a better screening tool than waist circumference and BMI for adult cardiometabolic risk factors: systematic review and meta-analysis | Obes Rev | Метаанализ | [22106927](https://pubmed.ncbi.nlm.nih.gov/22106927/) | [10.1111/j.1467-789X.2011.00952.x](https://doi.org/10.1111/j.1467-789X.2011.00952.x) | whtr-high |
| reynolds2019 | Reynolds A, Mann J, Cummings J, Winter N, Mete E, Te Morenga L, 2019 | Carbohydrate quality and human health: a series of systematic reviews and meta-analyses | Lancet | Метаанализ | [30638909](https://pubmed.ncbi.nlm.nih.gov/30638909/) | [10.1016/S0140-6736(18)31809-9](https://doi.org/10.1016/S0140-6736(18)31809-9) | fiber-low |
| searle2015 | Searle A, Spink M, Ho A, Chuter V, 2015 | Exercise interventions for the treatment of chronic low back pain: a systematic review and meta-analysis of randomised controlled trials | Clin Rehabil | Метаанализ | [25681408](https://pubmed.ncbi.nlm.nih.gov/25681408/) | [10.1177/0269215515570379](https://doi.org/10.1177/0269215515570379) | lordosis-axial |
| smith2014 | Smith BE, Littlewood C, May S, 2014 | An update of stabilisation exercises for low back pain: a systematic review with meta-analysis | BMC Musculoskelet Disord | Метаанализ | [25488399](https://pubmed.ncbi.nlm.nih.gov/25488399/) | [10.1186/1471-2474-15-416](https://doi.org/10.1186/1471-2474-15-416) | lordosis-axial |
| mcgill1998 | McGill SM, 1998 | Low back exercises: evidence for improving exercise regimens | Phys Ther | Обзор | [9672547](https://pubmed.ncbi.nlm.nih.gov/9672547/) | [10.1093/ptj/78.7.754](https://doi.org/10.1093/ptj/78.7.754) | lordosis-axial |
| zheng2015 | Zheng Y, Klem ML, Sereika SM, Danford CA, Ewing LJ, Burke LE, 2015 | Self-weighing in weight management: a systematic literature review | Obesity (Silver Spring) | Систематический обзор | [25521523](https://pubmed.ncbi.nlm.nih.gov/25521523/) | [10.1002/oby.20946](https://doi.org/10.1002/oby.20946) | weigh-in-rare |
| iraki2019 | Iraki J, Fitschen P, Espinar S, Helms E, 2019 | Nutrition Recommendations for Bodybuilders in the Off-Season: A Narrative Review | Sports (Basel) | Обзор | [31247944](https://pubmed.ncbi.nlm.nih.gov/31247944/) | [10.3390/sports7070154](https://doi.org/10.3390/sports7070154) | gain-too-fast |
| kouri1995 | Kouri EM, Pope HG Jr, Katz DL, Oliva P, 1995 | Fat-free mass index in users and nonusers of anabolic-androgenic steroids | Clin J Sport Med | Наблюдательное | [7496846](https://pubmed.ncbi.nlm.nih.gov/7496846/) | [10.1097/00042752-199510000-00003](https://doi.org/10.1097/00042752-199510000-00003) | ffmi-ceiling |
| roberts2020 | Roberts BM, Helms ER, Trexler ET, Fitschen PJ, 2020 | Nutritional Recommendations for Physique Athletes | J Hum Kinet | Обзор | [32148575](https://pubmed.ncbi.nlm.nih.gov/32148575/) | [10.2478/hukin-2019-0096](https://doi.org/10.2478/hukin-2019-0096) | loss-too-fast |

## 2. Источники формул

| Формула | Источник | Проверка |
|---|---|---|
| % жира ВМС США | Hodgdon JA, Beckett MB. Prediction of percent body fat for U.S. Navy men/women from body circumferences and height. Naval Health Research Center, Reports 84-11 и 84-29, 1984 | Технический отчёт, в PubMed нет, DOI нет — **не проверен** автоматически; формула приведена дословно из ТЗ и сверена с расчётом вручную (тест) |
| FFMI, нормализованный FFMI, потолок ≈ 25 | Kouri EM et al., 1995 — PMID [7496846](https://pubmed.ncbi.nlm.nih.gov/7496846/) | ✓ PubMed |
| Талия/рост, порог 0.5 | Ashwell M et al., 2012 — PMID [22106927](https://pubmed.ncbi.nlm.nih.gov/22106927/) | ✓ PubMed |
| BMR Mifflin–St Jeor | Mifflin MD et al. A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr 1990 — PMID [2305711](https://pubmed.ncbi.nlm.nih.gov/2305711/), DOI [10.1093/ajcn/51.2.241](https://doi.org/10.1093/ajcn/51.2.241) | ✓ PubMed |
| BMR Katch–McArdle 370 + 21.6·LBM | McArdle WD, Katch FI, Katch VL. Exercise Physiology (учебник) | Учебник — **не проверен** через PubMed/DOI |
| 1ПМ Brzycki | Brzycki M. Strength Testing—Predicting a One-Rep Max from Reps-to-Fatigue. JOPERD 1993;64(1):88–90 — DOI [10.1080/07303084.1993.10606684](https://doi.org/10.1080/07303084.1993.10606684) | ✓ Crossref |
| 1ПМ Epley | Epley B. Poundage Chart. Boyd Epley Workout, 1985 | Не индексируется — **не проверен** |
| DOTS | Коэффициенты формулы DOTS (IPF / OpenPowerlifting, 2019) | Не статья; проверен ручным расчётом (тест: 80 кг, сумма 500 → 344.77) |
| MET для калькулятора активности | Ainsworth BE et al. 2011 Compendium of Physical Activities — PMID [21681120](https://pubmed.ncbi.nlm.nih.gov/21681120/), DOI [10.1249/MSS.0b013e31821ece12](https://doi.org/10.1249/MSS.0b013e31821ece12); Herrmann SD et al. 2024 Adult Compendium — PMID [38242596](https://pubmed.ncbi.nlm.nih.gov/38242596/), DOI [10.1016/j.jshs.2023.10.010](https://doi.org/10.1016/j.jshs.2023.10.010) | ✓ PubMed (конкретные коды MET взяты по памяти — сверить с таблицей Compendium) |
| ≈ 7700 ккал на кг | Распространённое приближение (≈ 3500 ккал на фунт) | Не исследование; помечено в интерфейсе как приближение |
| Белок 1.6–2.2 г/кг; 2.3–3.1 г/кг LBM на сушке | Morton 2018 (PMID 28698222); Helms 2014 (PMID 24092765) | ✓ PubMed |
| Темп сушки 0.5–1 %/нед | Helms 2014 (PMID 24864135); Garthe 2011 (PMID 21558571); Roberts 2020 (PMID 32148575) | ✓ PubMed |
| Набор у опытных 0.25–0.5 %/нед | Iraki 2019 (PMID 31247944) | ✓ PubMed |

## 3. Эвристики (не исследования)

| Что | Источник | Статус |
|---|---|---|
| Пропорции Стива Ривза: бицепс 252 % запястья, голень 192 % лодыжки, шея ≈ бицепс ≈ голень, грудь 148 % таза, талия 86 % таза, бедро 175 % колена | Reeves S., Little J. Building the Classic Physique — The Natural Way, 1995 | Книга не сверена построчно: коэффициенты по вторичным источникам (Iron Man Magazine, Muscle & Strength). В интерфейсе подписано «эвристика» |
| Натуральный потенциал Casey Butt | Butt C. Your Muscular Potential, 4-е изд. (weightrainer.net) | Сайт автора был недоступен (ошибка сертификата TLS). Коэффициенты взяты из калькулятора bonytobeastly.com, который ссылается на 4-е издание; сверка — пример со страницы (рост 6′2″, запястье 6.75″ → бицепс ≈ 16″) совпал. Книга **не сверена** |
| Плечи/талия ≈ 1.618 | «Золотое сечение» — эстетический ориентир | Не исследование |
| Основная мышца = 1 подход, вспомогательная = 0.5 | Распространённая условность подсчёта объёма | Не исследование |
| Скорость набора сухой массы 1–2.5 кг/год при стаже 4+ лет | Тренерские модели (McDonald, Aragon) | Не исследование, высокая неопределённость |
| Разгрузочная неделя при застое 1ПМ | Тренерская практика | Не исследование |
| Нормативы силы по паттернам и оборудованию (штанга, гантели, Смит, тренажёры) и женские коэффициенты ×0,6 / ×0,7 | Ориентиры силовых таблиц и авторская оценка для тренажёров | Не исследование |
| Женская шкала уровней (FFMI 14→21, жир 35→18 %) | Авторская эвристика | Не исследование, данных мало |
| Оценка клетчатки и сахара по категории продукта | Типичные доли от углеводов по таблицам состава (округлено) | Приближение, помечено «≈» |
| Правило «тяг не меньше, чем жимов» | Тренерская практика | Не исследование |
