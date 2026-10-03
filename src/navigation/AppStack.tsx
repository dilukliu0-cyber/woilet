import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ChatScreen } from '../screens/chat/ChatScreen';
import { ShoppingScreen } from '../screens/shopping/ShoppingScreen';
import { AddExpenseScreen } from '../screens/addExpense/AddExpenseScreen';
import { ExpensesScreen } from '../screens/expenses/ExpensesScreen';
import { CategoryDetailScreen } from '../screens/category/CategoryDetailScreen';
import { CategoriesScreen } from '../screens/categories/CategoriesScreen';
import { FamilyScreen } from '../screens/family/FamilyScreen';
import { AddIncomeScreen } from '../screens/income/AddIncomeScreen';
import { IntroPreviewScreen } from '../screens/onboarding/IntroScreen';
import { ProductScreen } from '../screens/product/ProductScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { ReceiptDetailScreen } from '../screens/receiptDetail/ReceiptDetailScreen';
import { ScanScreen } from '../screens/scan/ScanScreen';
import { SubscriptionScreen } from '../screens/subscription/SubscriptionScreen';
import type { AppStackParamList } from './types';

const Stack = createNativeStackNavigator<AppStackParamList>();

export function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="Home" component={ExpensesScreen} />
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
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Shopping" component={ShoppingScreen} />
    </Stack.Navigator>
  );
}
