import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AddExpenseScreen } from '../screens/addExpense/AddExpenseScreen';
import { CategoryDetailScreen } from '../screens/category/CategoryDetailScreen';
import { CategoriesScreen } from '../screens/categories/CategoriesScreen';
import { FamilyScreen } from '../screens/family/FamilyScreen';
import { AddIncomeScreen } from '../screens/income/AddIncomeScreen';
import { IntroPreviewScreen } from '../screens/onboarding/IntroScreen';
import { ProductScreen } from '../screens/product/ProductScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { ReceiptDetailScreen } from '../screens/receiptDetail/ReceiptDetailScreen';
import { ScanScreen } from '../screens/scan/ScanScreen';
import { MainTabs } from './MainTabs';
import type { AppStackParamList } from './types';

const Stack = createNativeStackNavigator<AppStackParamList>();

export function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen name="Scan" component={ScanScreen} />
      <Stack.Screen name="ReceiptDetail" component={ReceiptDetailScreen} />
      <Stack.Screen name="Categories" component={CategoriesScreen} />
      <Stack.Screen name="AddExpense" component={AddExpenseScreen} />
      <Stack.Screen name="Product" component={ProductScreen} />
      <Stack.Screen name="Category" component={CategoryDetailScreen} />
      <Stack.Screen name="Family" component={FamilyScreen} />
      <Stack.Screen name="AddIncome" component={AddIncomeScreen} />
      <Stack.Screen name="IntroPreview" component={IntroPreviewScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}
