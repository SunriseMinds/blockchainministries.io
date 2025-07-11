import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB1cW9PGLeyW_y1kZAQy5CySjHH-6UVvK",
  authDomain: "blockchainministries-io.firebaseapp.com",
  projectId: "blockchainministries-io",
  storageBucket: "blockchainministries-io.appspot.com",
  messagingSenderId: "375405039719",
  appId: "1:375405039719:web:a190cf268dfe8ae27904c2"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);