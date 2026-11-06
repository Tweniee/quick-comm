/// Driver App copy in English and Hindi (masterplan: Hindi and English from day one).
class S {
  static String lang = 'hi';
  static const _t = <String, Map<String, String>>{
    'appTitle': {'en': 'Quick Delivery Partner', 'hi': 'क्विक डिलीवरी पार्टनर'},
    'phone': {'en': 'Mobile number', 'hi': 'मोबाइल नंबर'},
    'getOtp': {'en': 'Get OTP', 'hi': 'OTP पाएं'},
    'enterOtp': {'en': 'Enter the 6 digit code', 'hi': '6 अंकों का कोड डालें'},
    'login': {'en': 'Log in', 'hi': 'लॉग इन'},
    'online': {'en': 'You are ONLINE', 'hi': 'आप ऑनलाइन हैं'},
    'offline': {'en': 'You are OFFLINE', 'hi': 'आप ऑफलाइन हैं'},
    'goOnline': {'en': 'Go online', 'hi': 'ऑनलाइन जाएं'},
    'goOffline': {'en': 'Go offline', 'hi': 'ऑफलाइन जाएं'},
    'waiting': {'en': 'Waiting for a job near you…', 'hi': 'आपके पास जॉब का इंतज़ार…'},
    'today': {'en': 'Today', 'hi': 'आज'},
    'newJob': {'en': 'New job', 'hi': 'नया जॉब'},
    'accept': {'en': 'ACCEPT', 'hi': 'स्वीकार करें'},
    'decline': {'en': 'Decline', 'hi': 'मना करें'},
    'pickup': {'en': 'Pickup', 'hi': 'पिकअप'},
    'drop': {'en': 'Drop', 'hi': 'ड्रॉप'},
    'youEarn': {'en': 'You earn', 'hi': 'आपकी कमाई'},
    'navigate': {'en': 'Navigate', 'hi': 'रास्ता देखें'},
    'callBusiness': {'en': 'Call business', 'hi': 'दुकान को कॉल करें'},
    'callCustomer': {'en': 'Call customer', 'hi': 'ग्राहक को कॉल करें'},
    'confirmPickup': {'en': 'Parcel sealed & picked up', 'hi': 'पार्सल सील्ड है, पिकअप हुआ'},
    'sealCheck': {'en': 'Check the seal and the label. Do not open the parcel.', 'hi': 'सील और लेबल जांचें। पार्सल न खोलें।'},
    'refusePickup': {'en': 'Refuse pickup', 'hi': 'पिकअप से मना करें'},
    'arrived': {'en': "I've arrived", 'hi': 'मैं पहुंच गया'},
    'otpPrompt': {'en': 'Ask the customer for the 4 digit OTP', 'hi': 'ग्राहक से 4 अंकों का OTP पूछें'},
    'noOtpNoDelivery': {'en': 'No OTP, no delivery. Never hand over without the OTP.', 'hi': 'OTP नहीं तो डिलीवरी नहीं। बिना OTP पार्सल न दें।'},
    'deliver': {'en': 'Confirm delivery', 'hi': 'डिलीवरी पूरी करें'},
    'undelivered': {'en': 'Could not deliver', 'hi': 'डिलीवर नहीं हो सका'},
    'waitTimer': {'en': 'Wait at the location', 'hi': 'लोकेशन पर रुकें'},
    'calls': {'en': 'Calls made', 'hi': 'कॉल किए'},
    'returnTitle': {'en': 'Return parcel to the business', 'hi': 'पार्सल दुकान को वापस करें'},
    'returnCode': {'en': 'Return code from the business', 'hi': 'दुकान से रिटर्न कोड'},
    'confirmReturn': {'en': 'Confirm returned', 'hi': 'वापसी पूरी करें'},
    'help': {'en': 'Help', 'hi': 'मदद'},
    'queued': {'en': 'Saved offline, will sync', 'hi': 'ऑफलाइन सेव, बाद में सिंक होगा'},
    'earnings': {'en': 'Earnings', 'hi': 'कमाई'},
    'thisWeek': {'en': 'This week', 'hi': 'इस हफ्ते'},
    'unpaid': {'en': 'Unpaid (paid weekly)', 'hi': 'बाकी (हर हफ्ते भुगतान)'},
    'logout': {'en': 'Log out', 'hi': 'लॉग आउट'},
    'language': {'en': 'हिंदी', 'hi': 'English'},
    'delivered': {'en': 'Delivered! Well done.', 'hi': 'डिलीवर हो गया! शाबाश।'},
    'returned': {'en': 'Return complete.', 'hi': 'वापसी पूरी।'},
    'locationNeeded': {'en': 'Turn on location to go online', 'hi': 'ऑनलाइन जाने के लिए लोकेशन चालू करें'},
    'reason': {'en': 'Reason', 'hi': 'कारण'},
  };
  static String t(String k) => _t[k]?[lang] ?? _t[k]?['en'] ?? k;
}

const undeliveredReasons = {
  'CUSTOMER_NOT_REACHABLE': {'en': 'Customer not reachable', 'hi': 'ग्राहक से संपर्क नहीं'},
  'CUSTOMER_REFUSED': {'en': 'Customer refused', 'hi': 'ग्राहक ने मना किया'},
  'WRONG_ADDRESS': {'en': 'Wrong address', 'hi': 'गलत पता'},
  'OTP_NOT_PROVIDED': {'en': 'OTP not provided', 'hi': 'OTP नहीं दिया'},
  'CUSTOMER_ASKED_TO_RETURN': {'en': 'Customer asked to return', 'hi': 'ग्राहक ने वापस करने को कहा'},
  'RIDER_COULD_NOT_FIND_LOCATION': {'en': 'Could not find location', 'hi': 'लोकेशन नहीं मिली'},
};

const refuseReasons = {
  'SUSPICIOUS': {'en': 'Looks suspicious / illegal', 'hi': 'संदिग्ध / गैरकानूनी लगता है'},
  'OVERSIZE': {'en': 'Too big or heavy for bike', 'hi': 'बाइक के लिए बहुत बड़ा/भारी'},
  'NOT_SEALED': {'en': 'Not sealed or labelled', 'hi': 'सील या लेबल नहीं'},
  'NOT_READY': {'en': 'Parcel not ready', 'hi': 'पार्सल तैयार नहीं'},
};
