import { BrowserRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppProvider } from "@/state/app-context";
import { StoreProvider } from "@/state/store-context";
import { AppShell } from "@/components/layout/app-shell";
import Dashboard from "@/pages/dashboard";
import Orders from "@/pages/orders";
import OrderDetail from "@/pages/order-detail";
import Products from "@/pages/products";
import Categories from "@/pages/categories";
import CategoryEditor from "@/pages/category-editor";
import Attributes from "@/pages/attributes";
import AttributeEditor from "@/pages/attribute-editor";
import ProductEditor from "@/pages/product-editor";
import Discounts from "@/pages/discounts";
import DiscountEditor from "@/pages/discount-editor";
import Customers from "@/pages/customers";
import CustomerDetail from "@/pages/customer-detail";
import Settings from "@/pages/settings";
import Profile from "@/pages/profile";
import { Login, ForgotPassword, ResetPassword } from "@/pages/auth";

export default function App() {
  return (
    <AppProvider>
      <StoreProvider>
        <TooltipProvider>
          <BrowserRouter>
            <Routes>
              <Route path="login" element={<Login />} />
              <Route path="forgot" element={<ForgotPassword />} />
              <Route path="reset" element={<ResetPassword />} />
              <Route element={<AppShell />}>
                <Route index element={<Dashboard />} />
                <Route path="orders" element={<Orders />} />
                <Route path="orders/:num" element={<OrderDetail />} />
                <Route path="products" element={<Products />} />
                <Route path="products/categories" element={<Categories />} />
                <Route path="products/categories/new" element={<CategoryEditor />} />
                <Route path="products/categories/edit/:path" element={<CategoryEditor />} />
                <Route path="products/attributes" element={<Attributes />} />
                <Route path="products/attributes/new" element={<AttributeEditor />} />
                <Route path="products/attributes/edit/:id" element={<AttributeEditor />} />
                <Route path="products/new" element={<ProductEditor />} />
                <Route path="products/:id" element={<ProductEditor />} />
                <Route path="discounts" element={<Discounts />} />
                <Route path="discounts/new" element={<DiscountEditor />} />
                <Route path="discounts/edit/:id" element={<DiscountEditor />} />
                <Route path="customers" element={<Customers />} />
                <Route path="customers/:name" element={<CustomerDetail />} />
                <Route path="settings" element={<Settings />} />
                <Route path="profile" element={<Profile />} />
              </Route>
            </Routes>
          </BrowserRouter>
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </StoreProvider>
    </AppProvider>
  );
}
