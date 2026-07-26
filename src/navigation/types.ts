export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
};

export type OnboardingStackParamList = {
  Intro: undefined;
  Language: undefined;
  Currency: { language: string };
};

export type QueuedPhoto = { uri: string; base64: string };

export type AppStackParamList = {
  Tabs: undefined;
  Scan: undefined;
  ReceiptDetail: { receiptId: string };
  Categories: undefined;
  AddExpense: undefined;
  Product: { productName: string };
  Category: { categoryName: string };
  Family: undefined;
  AddIncome: undefined;
  IntroPreview: undefined;
  Profile: undefined;
};
