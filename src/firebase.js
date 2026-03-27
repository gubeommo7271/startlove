import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBwlvBDeL6b_b33rNyDeat62DWkX3tnnm0",
  authDomain: "startlove-d28b7.firebaseapp.com",
  projectId: "startlove-d28b7",
  storageBucket: "startlove-d28b7.firebasestorage.app",
  messagingSenderId: "1011111057808",
  appId: "1:1011111057808:web:4635fc2494d7bd9507bb15",
  measurementId: "G-KPJRTV64H3"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);