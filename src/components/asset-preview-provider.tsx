"use client";

import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  createPreviewState,
  type HistoryEvent,
  type Persona,
  type PreviewState,
  previewPeople,
} from "@/lib/asset-preview";

export const navIndexKeys = [
  "dashboard",
  "assets",
  "assetTypes",
  "inspections",
  "restoration",
  "settings",
  "allDepartments",
  "searchAssets",
  "syntheticPreview",
  "department",
  "language",
] as const;

export const dictionaries = {
  en: {
    // Navigation
    dashboard: "Dashboard",
    assets: "Assets",
    assetTypes: "Asset types",
    inspections: "Inspections",
    restoration: "Restoration",
    settings: "Settings",
    allDepartments: "All departments",
    searchAssets: "Search assets",
    syntheticPreview: "Synthetic preview",
    department: "Department",
    language: "Language",

    // Conditions
    condition_good: "Good",
    condition_fair: "Fair",
    condition_poor: "Poor",
    condition_critical: "Critical",
    condition_unknown: "Unknown",

    // Categories
    category_road_transit: "Roads & Transit",
    category_water_drainage: "Water & Drainage",
    category_energy_grid: "Energy Grid",
    category_public_building: "Public Buildings",
    category_green_spaces: "Green Spaces & Parks",

    // Workflow Statuses
    status_draft: "Draft",
    status_submitted: "Submitted",
    status_verified: "Verified",
    status_under_review: "Under Review",
    status_approved: "Approved",
    status_rejected: "Rejected",

    // Form Labels
    form_name: "Asset Name",
    form_code: "Register Code",
    form_category: "Base Category",
    form_department: "Responsible Department",
    form_coordinates: "GPS Coordinates",
    form_specs: "Technical Specifications",
    form_evidence: "Documentary Evidence",
    form_saveDraft: "Save Draft",
    form_submit: "Submit for Verification",

    // Errors
    error_required: "This field is required",
    error_invalidCoordinates:
      "Coordinates must be valid decimals (-90 to 90 lat, -180 to 180 lng)",
    error_unauthorized: "Unauthorized operation under current governance role",
    error_duplicateCode: "Asset code already exists in public register",
    error_reassignmentRequired:
      "Role retirement blocked: active members must be reassigned (SQL 23503)",

    // Dashboard Metrics
    metric_inventoryCount: "Statutory Inventory (N)",
    metric_inspectionCoverage: "Inspection Coverage Ratio (I/N)",
    metric_criticalRatio: "Critical Condition Ratio (P/I)",
    metric_restorationBacklog: "Restoration Backlog",
    metric_observationPairs: "Paired Observation Trends",
  },
  hi: {
    // Navigation
    dashboard: "डैशबोर्ड",
    assets: "संपत्तियाँ",
    assetTypes: "संपत्ति प्रकार",
    inspections: "निरीक्षण",
    restoration: "पुनर्स्थापन",
    settings: "सेटिंग्स",
    allDepartments: "सभी विभाग",
    searchAssets: "संपत्तियाँ खोजें",
    syntheticPreview: "काल्पनिक पूर्वावलोकन",
    department: "विभाग",
    language: "भाषा",

    // Conditions
    condition_good: "उत्तम (Good)",
    condition_fair: "संतोषजनक (Fair)",
    condition_poor: "खराब (Poor)",
    condition_critical: "गंभीर (Critical)",
    condition_unknown: "अज्ञात (Unknown)",

    // Categories
    category_road_transit: "सड़क एवं परिवहन",
    category_water_drainage: "जल एवं जल निकासी",
    category_energy_grid: "ऊर्जा ग्रिड",
    category_public_building: "सार्वजनिक भवन",
    category_green_spaces: "हरित क्षेत्र एवं उद्यान",

    // Workflow Statuses
    status_draft: "प्रारूप (Draft)",
    status_submitted: "प्रस्तुत (Submitted)",
    status_verified: "सत्यापित (Verified)",
    status_under_review: "समीक्षाधीन (Under Review)",
    status_approved: "स्वीकृत (Approved)",
    status_rejected: "अस्वीकृत (Rejected)",

    // Form Labels
    form_name: "संपत्ति का नाम",
    form_code: "पंजीकरण कोड",
    form_category: "मूल श्रेणी",
    form_department: "प्रभारी विभाग",
    form_coordinates: "जीपीएस निर्देशांक",
    form_specs: "तकनीकी विनिर्देश",
    form_evidence: "दस्तावेजी साक्ष्य",
    form_saveDraft: "प्रारूप सहेजें",
    form_submit: "सत्यापन हेतु प्रस्तुत करें",

    // Errors
    error_required: "यह विवरण अनिवार्य है",
    error_invalidCoordinates:
      "निर्देशांक मान्य दशमलव होने चाहिए (-90 से 90 अक्षांश, -180 से 180 देशांतर)",
    error_unauthorized: "वर्तमान भूमिका के अंतर्गत अनाधिकृत प्रक्रिया",
    error_duplicateCode: "पंजीकरण कोड लोक पंजी में पहले से विद्यमान है",
    error_reassignmentRequired:
      "पदमुक्ति अवरुद्ध: सक्रिय कर्मियों का पुनर्नियोजन अनिवार्य है (SQL 23503)",

    // Dashboard Metrics
    metric_inventoryCount: "सांविधिक परिसंपत्ति गणना (N)",
    metric_inspectionCoverage: "निरीक्षण कवरेज अनुपात (I/N)",
    metric_criticalRatio: "गंभीर स्थिति अनुपात (P/I)",
    metric_restorationBacklog: "पुनर्स्थापन बकाया कार्य",
    metric_observationPairs: "युग्मित अवलोकन रुझान",
  },
  gu: {
    // Navigation
    dashboard: "ડેશબોર્ડ",
    assets: "સંપત્તિઓ",
    assetTypes: "સંપત્તિના પ્રકારો",
    inspections: "નિરીક્ષણ",
    restoration: "પુનઃસ્થાપન",
    settings: "સેટિંગ્સ",
    allDepartments: "બધા વિભાગો",
    searchAssets: "સંપત્તિઓ શોધો",
    syntheticPreview: "કાલ્પનિક પૂર્વદર્શન",
    department: "વિભાગ",
    language: "ભાષા",

    // Conditions
    condition_good: "ઉત્તમ (Good)",
    condition_fair: "વાજબી (Fair)",
    condition_poor: "નબળું (Poor)",
    condition_critical: "ગંભીર (Critical)",
    condition_unknown: "અજ્ઞાત (Unknown)",

    // Categories
    category_road_transit: "માર્ગ અને પરિવહન",
    category_water_drainage: "પાણી અને ગટર વ્યવસ્થા",
    category_energy_grid: "ઊર્જા ગ્રીડ",
    category_public_building: "જાહેર મકાનો",
    category_green_spaces: "હરિયાળી જગ્યાઓ અને બગીચાઓ",

    // Workflow Statuses
    status_draft: "ડ્રાફ્ટ (Draft)",
    status_submitted: "સબમિટ કરેલ (Submitted)",
    status_verified: "ચકાસાયેલ (Verified)",
    status_under_review: "સમીક્ષા હેઠળ (Under Review)",
    status_approved: "મંજૂર કરેલ (Approved)",
    status_rejected: "અસ્વીકાર્ય (Rejected)",

    // Form Labels
    form_name: "સંપત્તિનું નામ",
    form_code: "નોંધણી કોડ",
    form_category: "મૂળ શ્રેણી",
    form_department: "જવાબદાર વિભાગ",
    form_coordinates: "જીપીએસ કોઓર્ડિનેટ્સ",
    form_specs: "તકનીકી વિગતો",
    form_evidence: "દસ્તાવેજી પુરાવા",
    form_saveDraft: "ડ્રાફ્ટ સાચવો",
    form_submit: "ચકાસણી માટે મોકલો",

    // Errors
    error_required: "આ ક્ષેત્ર ફરજિયાત છે",
    error_invalidCoordinates:
      "કોઓર્ડિનેટ્સ માન્ય દશાંશ હોવા જોઈએ (-90 થી 90 અક્ષાંશ, -180 થી 180 રેખાંશ)",
    error_unauthorized: "વર્તમાન હોદ્દા હેઠળ અનધિકૃત ક્રિયા",
    error_duplicateCode: "નોંધણી કોડ સરકારી રજિસ્ટરમાં પહેલેથી હાજર છે",
    error_reassignmentRequired:
      "હોદ્દો મુક્ત કરવો અવરોધિત: સક્રિય સભ્યોનું પુનઃસોંપણી જરૂરી છે (SQL 23503)",

    // Dashboard Metrics
    metric_inventoryCount: "કાયદેસર નોંધાયેલ સંપત્તિ (N)",
    metric_inspectionCoverage: "નિરીક્ષણ કવરેજ ગુણોત્તર (I/N)",
    metric_criticalRatio: "ગંભીર સ્થિતિ ગુણોત્તર (P/I)",
    metric_restorationBacklog: "બાકી પુનઃસ્થાપન કાર્ય",
    metric_observationPairs: "જોડી અવલોકન વલણો",
  },
  mr: {
    // Navigation
    dashboard: "डॅशबोर्ड",
    assets: "मालमत्ता",
    assetTypes: "मालमत्ता प्रकार",
    inspections: "तपासणी",
    restoration: "पुनर्संचयन",
    settings: "सेटिंग्ज",
    allDepartments: "सर्व विभाग",
    searchAssets: "मालमत्ता शोधा",
    syntheticPreview: "प्रात्यक्षिक पूर्वावलोकन",
    department: "विभाग",
    language: "भाषा",

    // Conditions
    condition_good: "उत्कृष्ट (Good)",
    condition_fair: "समाधानकारक (Fair)",
    condition_poor: "खराब (Poor)",
    condition_critical: "गंभीर (Critical)",
    condition_unknown: "अज्ञात (Unknown)",

    // Categories
    category_road_transit: "रस्ते व वाहतूक",
    category_water_drainage: "पाणी व सांडपाणी व्यवस्था",
    category_energy_grid: "ऊर्जा ग्रिड",
    category_public_building: "सार्वजनिक इमारती",
    category_green_spaces: "हिरवे पट्टे व उद्याने",

    // Workflow Statuses
    status_draft: "मसुदा (Draft)",
    status_submitted: "सादर केले (Submitted)",
    status_verified: "पडताळणीकृत (Verified)",
    status_under_review: "पुनरावलोकनाधीन (Under Review)",
    status_approved: "मंजूर (Approved)",
    status_rejected: "नाकारले (Rejected)",

    // Form Labels
    form_name: "मालमत्तेचे नाव",
    form_code: "नोंदणी कोड",
    form_category: "मूळ वर्गवारी",
    form_department: "जबाबदार विभाग",
    form_coordinates: "जीपीएस समन्वय",
    form_specs: "तांत्रिक वैशिष्ट्ये",
    form_evidence: "दस्तऐवजी पुरावा",
    form_saveDraft: "मसुदा जतन करा",
    form_submit: "पडताळणीसाठी सादर करा",

    // Errors
    error_required: "हा रकाना अनिवार्य आहे",
    error_invalidCoordinates:
      "समन्वय वैध दशांश असावेत (-90 ते 90 अक्षांश, -180 ते 180 रेखांश)",
    error_unauthorized: "सध्याच्या भूमिकेत अनधिकृत कृती",
    error_duplicateCode: "नोंदणी कोड आधीच सार्वजनिक नोंदवहीत अस्तित्वात आहे",
    error_reassignmentRequired:
      "भूमिका निवृत्ती अवरोधित: सक्रिय कर्मचाऱ्यांचे पुनर्वाटप आवश्यक (SQL 23503)",

    // Dashboard Metrics
    metric_inventoryCount: "वैधानिक मालमत्ता गणना (N)",
    metric_inspectionCoverage: "तपासणी व्याप्ती प्रमाण (I/N)",
    metric_criticalRatio: "गंभीर स्थिती प्रमाण (P/I)",
    metric_restorationBacklog: "प्रलंबित पुनर्संचयन कामे",
    metric_observationPairs: "जोडीदार निरीक्षण प्रवाह",
  },
  bn: {
    // Navigation
    dashboard: "ড্যাশবোর্ড",
    assets: "সম্পদসমূহ",
    assetTypes: "সম্পদের প্রকার",
    inspections: "পরিদর্শন",
    restoration: "পুনরুদ্ধার",
    settings: "সেটিংস",
    allDepartments: "সমস্ত বিভাগ",
    searchAssets: "সম্পদ অনুসন্ধান",
    syntheticPreview: "প্রদর্শনী পূর্বরূপ",
    department: "বিভাগ",
    language: "ভাষা",

    // Conditions
    condition_good: "উত্তম (Good)",
    condition_fair: "সন্তোষজনক (Fair)",
    condition_poor: "খারাপ (Poor)",
    condition_critical: "সংকটজনক (Critical)",
    condition_unknown: "অজ্ঞাত (Unknown)",

    // Categories
    category_road_transit: "সড়ক ও পরিবহন",
    category_water_drainage: "পানি ও পয়ঃনিষ্কাশন",
    category_energy_grid: "বিদ্যুৎ গ্রিড",
    category_public_building: "সরকারি ভবন",
    category_green_spaces: "সবুজ প্রান্তর ও উদ্যান",

    // Workflow Statuses
    status_draft: "খসড়া (Draft)",
    status_submitted: "দাখিলকৃত (Submitted)",
    status_verified: "যাচাইকৃত (Verified)",
    status_under_review: "পর্যালোচনাধীন (Under Review)",
    status_approved: "অনুমোদিত (Approved)",
    status_rejected: "প্রত্যাখ্যাত (Rejected)",

    // Form Labels
    form_name: "সম্পদের নাম",
    form_code: "নিবন্ধন কোড",
    form_category: "মূল শ্রেণী",
    form_department: "দায়িত্বপ্রাপ্ত বিভাগ",
    form_coordinates: "জিপিএস স্থানাঙ্ক",
    form_specs: "প্রযুক্তিগত বৈশিষ্ট্য",
    form_evidence: "প্রামাণ্য দলিল",
    form_saveDraft: "খসড়া সংরক্ষণ করুন",
    form_submit: "যাচাইয়ের জন্য দাখিল করুন",

    // Errors
    error_required: "এই ক্ষেত্রটি পূরণ করা আবশ্যক",
    error_invalidCoordinates:
      "স্থানাঙ্ক বৈধ দশমিক হতে হবে (-৯০ থেকে ৯০ অক্ষাংশ, -১৮০ থেকে ১৮০ দ্রাঘিমাংশ)",
    error_unauthorized: "বর্তমান পদের অধীনে অননুমোদিত কার্যকলাপ",
    error_duplicateCode: "নিবন্ধন কোড ইতিমধ্যে সরকারি রেজিস্টারে বিদ্যমান",
    error_reassignmentRequired:
      "পদ প্রত্যাহারের প্রক্রিয়া স্থগিত: সক্রিয় সদস্যদের পুনঃবরাদ্দ আবশ্যক (SQL 23503)",

    // Dashboard Metrics
    metric_inventoryCount: "বিধিবদ্ধ সম্পদ গণনা (N)",
    metric_inspectionCoverage: "পরিদর্শন অনুপাত (I/N)",
    metric_criticalRatio: "সংকটজনক পরিস্থিতি অনুপাত (P/I)",
    metric_restorationBacklog: "বকেয়া পুনরুদ্ধার কাজ",
    metric_observationPairs: "যুগ্ম পর্যবেক্ষণ প্রবণতা",
  },
  ta: {
    // Navigation
    dashboard: "டாஷ்போர்டு",
    assets: "சொத்துகள்",
    assetTypes: "சொத்து வகைகள்",
    inspections: "ஆய்வுகள்",
    restoration: "சீரமைப்பு",
    settings: "அமைப்புகள்",
    allDepartments: "அனைத்து துறைகள்",
    searchAssets: "சொத்துகளைத் தேடுக",
    syntheticPreview: "மாதிரி முன்னோட்டம்",
    department: "துறை",
    language: "மொழி",

    // Conditions
    condition_good: "நன்று (Good)",
    condition_fair: "மிதமானது (Fair)",
    condition_poor: "மோசமானது (Poor)",
    condition_critical: "மிக மோசம் (Critical)",
    condition_unknown: "தெரியவில்லை (Unknown)",

    // Categories
    category_road_transit: "சாலைகள் மற்றும் போக்குவரத்து",
    category_water_drainage: "நீர் மற்றும் வடிகால்",
    category_energy_grid: "மின் கட்டமைப்பு",
    category_public_building: "பொதுக் கட்டிடங்கள்",
    category_green_spaces: "பசுமை பூங்காக்கள்",

    // Workflow Statuses
    status_draft: "வரைவு (Draft)",
    status_submitted: "சமர்ப்பிக்கப்பட்டது (Submitted)",
    status_verified: "சரிபார்க்கப்பட்டது (Verified)",
    status_under_review: "மதிப்பாய்வில் (Under Review)",
    status_approved: "ஏற்கப்பட்டது (Approved)",
    status_rejected: "நிராகரிக்கப்பட்டது (Rejected)",

    // Form Labels
    form_name: "சொத்தின் பெயர்",
    form_code: "பதிவுக் குறியீடு",
    form_category: "அடிப்படை வகை",
    form_department: "பொறுப்புத் துறை",
    form_coordinates: "ஜிபிஎஸ் ஒருங்கிணைப்புகள்",
    form_specs: "தொழில்நுட்ப விவரங்கள்",
    form_evidence: "ஆவணச் சான்று",
    form_saveDraft: "வரைவைச் சேமி",
    form_submit: "சரிபார்ப்புக்கு சமர்ப்பி",

    // Errors
    error_required: "இப்புலம் கட்டாயமானது",
    error_invalidCoordinates:
      "ஒருங்கிணைப்புகள் சரியான தசமமாக இருக்க வேண்டும் (-90 முதல் 90 அட்சரேகை, -180 முதல் 180 தீர்க்கரேகை)",
    error_unauthorized: "தற்போதைய பொறுப்பின் கீழ் அங்கீகரிக்கப்படாத செயல்பாடு",
    error_duplicateCode: "பதிவுக் குறியீடு ஏற்கனவே பொதுப் பதிவேட்டில் உள்ளது",
    error_reassignmentRequired:
      "பொறுப்பு நீக்கம் தடுக்கப்பட்டது: செயலில் உள்ள பணியாளர்களை மறுஒதுக்கீடு செய்ய வேண்டும் (SQL 23503)",

    // Dashboard Metrics
    metric_inventoryCount: "சட்டபூர்வ சொத்து எண்ணிக்கை (N)",
    metric_inspectionCoverage: "ஆய்வு வரம்பு விகிதம் (I/N)",
    metric_criticalRatio: "ஆபத்தான நிலை விகிதம் (P/I)",
    metric_restorationBacklog: "நிலுவையிலுள்ள சீரமைப்புப் பணிகள்",
    metric_observationPairs: "இணைந்த ஆய்வுப் போக்குகள்",
  },
  te: {
    // Navigation
    dashboard: "డాష్‌బోర్డ్",
    assets: "ఆస్తులు",
    assetTypes: "ఆస్తి రకాలు",
    inspections: "తనిఖీలు",
    restoration: "పునరుద్ధరణ",
    settings: "సెట్టింగ్‌లు",
    allDepartments: "అన్ని విభాగాలు",
    searchAssets: "ఆస్తులను వెతకండి",
    syntheticPreview: "ప్రయోగాత్మక ప్రివ్యూ",
    department: "విభాగం",
    language: "భాష",

    // Conditions
    condition_good: "బాగుంది (Good)",
    condition_fair: "పరవాలేదు (Fair)",
    condition_poor: "బాగోలేదు (Poor)",
    condition_critical: "తీవ్రమైనది (Critical)",
    condition_unknown: "తెలియదు (Unknown)",

    // Categories
    category_road_transit: "రోడ్లు మరియు రవాణా",
    category_water_drainage: "నీరు మరియు డ్రైనేజీ",
    category_energy_grid: "విద్యుత్ గ్రిడ్",
    category_public_building: "ప్రజా భవనాలు",
    category_green_spaces: "హరిత ప్రదేశాలు మరియు పార్కులు",

    // Workflow Statuses
    status_draft: "చిత్తుప్రతి (Draft)",
    status_submitted: "సమర్పించబడింది (Submitted)",
    status_verified: "ధృవీకరించబడింది (Verified)",
    status_under_review: "సమీక్షలో ఉంది (Under Review)",
    status_approved: "ఆమోదించబడింది (Approved)",
    status_rejected: "తిరస్కరించబడింది (Rejected)",

    // Form Labels
    form_name: "ఆస్తి పేరు",
    form_code: "నమోదు కోడ్",
    form_category: "ప్రాథమిక వర్గం",
    form_department: "బాధ్యతాయుత విభాగం",
    form_coordinates: "జీపీఎస్ కోఆర్డినేట్లు",
    form_specs: "సాంకేతిక వివరాలు",
    form_evidence: "డాక్యుమెంటరీ ఆధారాలు",
    form_saveDraft: "చిత్తుప్రతిని భద్రపరచండి",
    form_submit: "ధృవీకరణ కోసం సమర్పించండి",

    // Errors
    error_required: "ఈ ఫీల్డ్ తప్పనిసరి",
    error_invalidCoordinates:
      "కోఆర్డినేట్లు చెల్లుబాటు అయ్యే దశాంశాలుగా ఉండాలి (-90 నుండి 90 అక్షాంశం, -180 నుండి 180 రేఖాంశం)",
    error_unauthorized: "ప్రస్తుత హోదా కింద అనధికారిక చర్య",
    error_duplicateCode: "నమోదు కోడ్ ఇప్పటికే పబ్లిక్ రిజిస్టర్‌లో ఉంది",
    error_reassignmentRequired:
      "పదవీ విరమణ నిలిపివేయబడింది: క్రియాశీల సభ్యులను పునఃకేటాయించాలి (SQL 23503)",

    // Dashboard Metrics
    metric_inventoryCount: "చట్టబద్ధమైన ఆస్తుల సంఖ్య (N)",
    metric_inspectionCoverage: "తనిఖీ విస్తృతి నిష్పత్తి (I/N)",
    metric_criticalRatio: "తీవ్రమైన స్థితి నిష్పత్తి (P/I)",
    metric_restorationBacklog: "బాకీ ఉన్న పునరుద్ధరణ పనులు",
    metric_observationPairs: "జతచేసిన పరిశీలన పోకడలు",
  },
} as const;

export const languages = [
  { code: "en", name: "English" },
  { code: "hi", name: "हिन्दी" },
  { code: "gu", name: "ગુજરાતી" },
  { code: "mr", name: "मराठी" },
  { code: "bn", name: "বাংলা" },
  { code: "ta", name: "தமிழ்" },
  { code: "te", name: "తెలుగు" },
] as const;

export type PreviewLocale = (typeof languages)[number]["code"];
export type TranslationKey = keyof typeof dictionaries.en;

interface ContextValue {
  state: PreviewState;
  setState: Dispatch<SetStateAction<PreviewState>>;
  department: string;
  setDepartment: Dispatch<SetStateAction<string>>;
  persona: Persona;
  setPersona: Dispatch<SetStateAction<Persona>>;
  locale: PreviewLocale;
  setLocale: Dispatch<SetStateAction<PreviewLocale>>;
  notice: string;
  notify: (text: string) => void;
  label: (keyOrIndex: number | string) => string;
  t: (key: string) => string;
  basePath: string;
  actor: string;
}

const Context = createContext<ContextValue | null>(null);

function getInitialLocale(): PreviewLocale {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|; )pravi_locale=([^;]+)/);
    if (match?.[1] && match[1] in dictionaries) {
      return match[1] as PreviewLocale;
    }
  }
  return "en";
}

export function AssetPreviewProvider({
  children,
  basePath,
}: {
  children: ReactNode;
  basePath: string;
}) {
  const [state, setState] = useState(createPreviewState);
  const [department, setDepartment] = useState("all");
  const [persona, setPersona] = useState<Persona>("central");
  const [locale, setLocaleState] = useState<PreviewLocale>("en");
  const [notice, notify] = useState("");

  // Load locale from cookie on mount
  useEffect(() => {
    const initial = getInitialLocale();
    if (initial !== "en") {
      setLocaleState(initial);
    }
  }, []);

  const setLocale: Dispatch<SetStateAction<PreviewLocale>> = (action) => {
    setLocaleState((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      if (typeof document !== "undefined") {
        // biome-ignore lint/suspicious/noDocumentCookie: Client cookie persistence for SSR locale synchronization
        document.cookie = `pravi_locale=${next}; path=/; max-age=31536000; SameSite=Lax`;
      }
      return next;
    });
  };

  const translate = (key: string): string => {
    const dict = dictionaries[locale] as Record<string, string>;
    const defaultDict = dictionaries.en as Record<string, string>;
    return dict[key] ?? defaultDict[key] ?? key;
  };

  const label = (keyOrIndex: number | string): string => {
    if (typeof keyOrIndex === "number") {
      const key = navIndexKeys[keyOrIndex];
      return key ? translate(key) : "";
    }
    return translate(keyOrIndex);
  };

  return (
    <Context.Provider
      value={{
        state,
        setState,
        department,
        setDepartment,
        persona,
        setPersona,
        locale,
        setLocale,
        notice,
        notify,
        label,
        t: translate,
        basePath,
        actor: previewPeople[persona].id,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useAssetPreview() {
  const value = useContext(Context);
  if (!value) throw new Error("Asset preview provider is missing");
  return value;
}

export function previewEvent(
  assetId: string,
  actor: string,
  action: string,
  before: string,
  after: string,
  reason: string,
): HistoryEvent {
  return {
    id: crypto.randomUUID(),
    assetId,
    date: "2026-09-28",
    actor,
    action,
    before,
    after,
    reason,
  };
}
