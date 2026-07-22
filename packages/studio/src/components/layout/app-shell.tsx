import { useMemo, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, Link } from "react-router-dom";
import {
  Home,
  ShoppingBag,
  Package,
  Tag,
  Users,
  Settings,
  Sun,
  Moon,
  PanelLeft,
  ChevronRight,
} from "lucide-react";
import { useApp } from "@/state/app-context";
import { useStore } from "@/state/store-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface NavDef {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  children?: { to: string; label: string; end?: boolean }[];
}

export function AppShell() {
  const { theme, toggleTheme, storeName, userName, userEmail } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const { pendingCount } = useStore();

  const nav: NavDef[] = useMemo(
    () => [
      { to: "/", label: "Dashboard", icon: <Home /> },
      { to: "/orders", label: "Orders", icon: <ShoppingBag />, badge: pendingCount || undefined },
      {
        to: "/products",
        label: "Products",
        icon: <Package />,
        children: [
          { to: "/products", label: "All Products", end: true },
          { to: "/products/categories", label: "Categories" },
          { to: "/products/attributes", label: "Attributes" },
        ],
      },
      { to: "/discounts", label: "Discounts", icon: <Tag /> },
      { to: "/customers", label: "Customers", icon: <Users /> },
      { to: "/settings", label: "Settings", icon: <Settings /> },
    ],
    [pendingCount],
  );

  const path = location.pathname;
  const crumb = path.startsWith("/orders/")
    ? { label: "Orders", to: "/orders", title: "Order detail" }
    : path === "/products/categories/new"
      ? { label: "Categories", to: "/products/categories", title: "New category" }
      : path.startsWith("/products/categories/edit/")
        ? { label: "Categories", to: "/products/categories", title: "Edit category" }
        : path === "/products/attributes/new"
          ? { label: "Attributes", to: "/products/attributes", title: "New attribute" }
          : path.startsWith("/products/attributes/edit/")
            ? { label: "Attributes", to: "/products/attributes", title: "Edit attribute" }
            : path === "/products/categories" || path === "/products/attributes"
      ? null
      : path.startsWith("/products/")
      ? { label: "Products", to: "/products", title: path === "/products/new" ? "New product" : "Edit product" }
      : path.startsWith("/customers/")
        ? { label: "Customers", to: "/customers", title: decodeURIComponent(path.split("/")[2] ?? "Customer") }
        : path === "/discounts/new"
          ? { label: "Discounts", to: "/discounts", title: "Create discount" }
          : path.startsWith("/discounts/edit/")
            ? { label: "Discounts", to: "/discounts", title: "Edit discount" }
            : null;

  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r bg-background transition-[width] duration-150",
          collapsed ? "w-14" : "w-[260px]",
        )}
      >
        <div className="flex items-center gap-2.5 px-3.5 pb-3 pt-4">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            S
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold leading-tight">
                {storeName}
              </div>
              <div className="truncate text-[11px] leading-tight text-muted-foreground">
                Stray Studio
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelLeft className="size-3.5" />
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 p-2.5">
          {nav.map((item) => {
            const sectionActive =
              item.to === "/" ? path === "/" : path.startsWith(item.to);
            const isGroup = !!item.children && !collapsed;
            const childActive = (to: string, end?: boolean) =>
              end
                ? path === to ||
                  (path.startsWith(`${to}/`) &&
                    !item.children!.some((c) => !c.end && path.startsWith(c.to)))
                : path.startsWith(to);
            return (
              <div key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === "/"}
                  title={item.label}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] [&_svg]:size-4 [&_svg]:shrink-0",
                    sectionActive
                      ? isGroup
                        ? "font-semibold text-foreground"
                        : "bg-accent font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {item.icon}
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                  {!collapsed && item.badge != null && (
                    <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground tabular-nums">
                      {item.badge}
                    </span>
                  )}
                  {isGroup && (
                    <ChevronRight
                      className={cn(
                        "!size-3.5 text-muted-foreground transition-transform duration-100",
                        sectionActive && "rotate-90",
                      )}
                    />
                  )}
                </NavLink>
                {isGroup && sectionActive && (
                  <div className="mt-px flex flex-col gap-px">
                    {item.children!.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        end={child.end}
                        className={cn(
                          "flex h-9 items-center rounded-lg py-0 pl-[42px] pr-3 text-[13px]",
                          childActive(child.to, child.end)
                            ? "bg-accent font-medium text-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="flex flex-col gap-0.5 border-t p-2.5">
          <button
            onClick={toggleTheme}
            className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {theme === "light" ? <Moon className="size-4 shrink-0" /> : <Sun className="size-4 shrink-0" />}
            {!collapsed && <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-left hover:bg-accent">
                <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full border bg-muted text-[10px] font-semibold">
                  {initials}
                </span>
                {!collapsed && (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium leading-tight">
                      {userName}
                    </span>
                    <span className="block text-[11px] leading-tight text-muted-foreground">
                      Owner
                    </span>
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-52">
              <DropdownMenuLabel>
                <div className="font-semibold">{userName}</div>
                <div className="text-[11px] font-normal text-muted-foreground">
                  {userEmail}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/profile">Profile</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/login">Sign out</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center gap-2 border-b px-6">
          {crumb && (
            <>
              <Link
                to={crumb.to}
                className="text-[13px] text-muted-foreground hover:text-foreground"
              >
                {crumb.label}
              </Link>
              <span className="text-xs text-muted-foreground">/</span>
              <div className="text-[13px] font-medium">{crumb.title}</div>
            </>
          )}
          <div className="flex-1" />
        </header>
        <main className="relative flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1080px] p-6 pb-20">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
