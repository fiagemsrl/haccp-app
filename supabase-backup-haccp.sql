create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamp with time zone default now(),
  vat_number text,
  address text,
  manager_name text,
  phone text
);

create table if not exists restaurant_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text default 'employee',
  created_at timestamp with time zone default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  type text default 'PDF',
  category text,
  expiry date,
  url text,
  uploaded_at timestamp with time zone default now()
);

create table if not exists non_conformities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  severity text default 'Media',
  action text,
  status text default 'Aperta',
  photo_url text,
  operator text,
  created_at timestamp with time zone default now()
);