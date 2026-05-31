// Inicialização do Firebase no client — usado para o login das barbearias.
// Estes valores NÃO são segredo (ficam embutidos no site); o que protege os
// dados é o login + as regras de segurança do Firestore.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDZr5719XL_x8SNwGG5cZH3v0yutkD1ntY',
  authDomain: 'barberman-qryav.firebaseapp.com',
  projectId: 'barberman-qryav',
  storageBucket: 'barberman-qryav.firebasestorage.app',
  messagingSenderId: '269108482316',
  appId: '1:269108482316:web:66b4a20c68fc8e22b07929',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
