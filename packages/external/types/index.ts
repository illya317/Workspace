export interface Customer {
  id: number;
  name: string;
  contact?: string;
  phone?: string;
  category?: string;
  remark?: string;
}

export interface Investor {
  id: number;
  name: string;
  contact?: string;
  type?: string;
  remark?: string;
}

export interface Supplier {
  id: number;
  name: string;
  contact?: string;
  phone?: string;
  category?: string;
  remark?: string;
}
