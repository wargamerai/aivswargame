// Firebase設定ファイル
const firebaseConfig = {
    apiKey: "AIzaSyCx8Q148m7u7V7eynkY3IzojwzND1lEQVI",
    authDomain: "panzer-waffe.firebaseapp.com",
    databaseURL: "https://panzer-waffe-default-rtdb.firebaseio.com",
    projectId: "panzer-waffe",
    storageBucket: "panzer-waffe.firebasestorage.app",
    messagingSenderId: "467587264225",
    appId: "1:467587264225:web:a1638e6da4a1485fe4d1a0",
    measurementId: "G-EBJ1KWFGXE"
};

firebase.initializeApp(firebaseConfig);
window.db = firebase.firestore();
