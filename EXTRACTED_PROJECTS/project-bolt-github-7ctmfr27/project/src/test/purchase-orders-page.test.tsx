import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PurchaseOrdersPage } from '@/components/PurchaseOrdersPage';

const mocks=vi.hoisted(()=>({
  fetchPurchaseOrders:vi.fn(),fetchSuppliers:vi.fn(),fetchProducts:vi.fn(),fetchActiveInventoryWarehouses:vi.fn(),
  submitPurchaseOrder:vi.fn(),createPurchaseOrder:vi.fn(),cancelPurchaseOrder:vi.fn(),receivePurchaseOrder:vi.fn(),
  canManage:true,
}));
vi.mock('@/lib/api',()=>({
  fetchPurchaseOrders:mocks.fetchPurchaseOrders,fetchSuppliers:mocks.fetchSuppliers,fetchProducts:mocks.fetchProducts,
  fetchActiveInventoryWarehouses:mocks.fetchActiveInventoryWarehouses,submitPurchaseOrder:mocks.submitPurchaseOrder,
  createPurchaseOrder:mocks.createPurchaseOrder,cancelPurchaseOrder:mocks.cancelPurchaseOrder,receivePurchaseOrder:mocks.receivePurchaseOrder,
}));
vi.mock('@/lib/auth',()=>({useAuth:()=>({user:{roles:mocks.canManage?['manager']:['staff']}})}));

const draft={
  id:'po-1',organization_id:'org-1',purchase_order_number:'PO-20261019-000001',
  supplier_id:'supplier-1',supplier_name:'مورد موثوق',supplier_code:'SUP-01',
  warehouse_id:'warehouse-1',warehouse_name:'المخزن الرئيسي',status:'draft',notes:null,total_cost:25,
  created_by:'manager-1',submitted_by:null,submitted_at:null,cancelled_by:null,cancelled_at:null,cancellation_reason:null,
  created_at:'2026-10-19T09:00:00Z',updated_at:'2026-10-19T09:00:00Z',
  items:[{id:'line-1',product_id:'product-1',item_code:'0000125',product_name:'سكر',unit:'كرتون',quantity_ordered:2,
    quantity_received:0,remaining_quantity:2,unit_cost:12.5,line_total:25}],
};
const submitted={...draft,status:'submitted',submitted_by:'manager-1',submitted_at:'2026-10-19T09:30:00Z'};

describe('purchase orders page',()=>{
  beforeEach(()=>{
    mocks.canManage=true;
    mocks.fetchPurchaseOrders.mockReset().mockResolvedValue([draft]);
    mocks.fetchSuppliers.mockReset().mockResolvedValue([{id:'supplier-1',name:'مورد موثوق',supplier_code:'SUP-01',status:'active'}]);
    mocks.fetchProducts.mockReset().mockResolvedValue([{id:'product-1',name:'سكر',item_code:'0000125',unit:'كرتون',status:'active'}]);
    mocks.fetchActiveInventoryWarehouses.mockReset().mockResolvedValue([{id:'warehouse-1',name:'المخزن الرئيسي',code:'WH-01'}]);
    mocks.submitPurchaseOrder.mockReset().mockResolvedValue({purchase_order:submitted,idempotent_replay:false});
    mocks.createPurchaseOrder.mockReset().mockResolvedValue({purchase_order:draft,idempotent_replay:false});
    mocks.cancelPurchaseOrder.mockReset().mockResolvedValue({purchase_order:{...draft,status:'cancelled'},idempotent_replay:false});
    mocks.receivePurchaseOrder.mockReset().mockResolvedValue({purchase_order:{...draft,status:'received'},receipt:{id:'receipt-1',receipt_number:'PR-01',purchase_order_id:'po-1',received_at:'2026-10-19T10:00:00Z'},idempotent_replay:false});
  });
  afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});

  it('loads real supplier/catalog references and allows managers to select and submit a saved draft',async()=>{
    mocks.fetchPurchaseOrders.mockResolvedValueOnce([draft]).mockResolvedValueOnce([submitted]);
    render(<PurchaseOrdersPage/>);
    expect(await screen.findByText('PO-20261019-000001')).toBeInTheDocument();
    expect(mocks.fetchSuppliers).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:/PO-20261019-000001/}));
    expect(await screen.findByText('مورد موثوق')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/اعتماد أمر الشراء للتوريد/}));
    expect(await screen.findByText(/تم اعتماد أمر الشراء داخل النظام/)).toBeInTheDocument();
    expect(mocks.submitPurchaseOrder).toHaveBeenCalledWith('po-1');
  });

  it('does not call purchase APIs for an account without the manager/admin role',()=>{
    mocks.canManage=false;
    render(<PurchaseOrdersPage/>);
    expect(screen.getByText(/صلاحية إدارة المشتريات مطلوبة/)).toBeInTheDocument();
    expect(mocks.fetchPurchaseOrders).not.toHaveBeenCalled();
  });

  it('creates a target-native draft while preserving an unknown unit cost as null',async()=>{
    vi.stubGlobal('crypto',{randomUUID:()=> '22222222-2222-4222-8222-222222222222'});
    render(<PurchaseOrdersPage/>);
    expect(await screen.findByText('PO-20261019-000001')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/إنشاء مسودة أمر شراء/}));
    fireEvent.change(screen.getByLabelText('الصنف'),{target:{value:'product-1'}});
    fireEvent.click(screen.getByRole('button',{name:/حفظ مسودة أمر الشراء/}));
    expect(await screen.findByText(/حُفظت مسودة أمر الشراء من البيانات الحالية/)).toBeInTheDocument();
    expect(mocks.createPurchaseOrder).toHaveBeenCalledTimes(1);
    const input=mocks.createPurchaseOrder.mock.calls[0][0];
    expect(input.lines).toEqual([{product_id:'product-1',quantity:1,unit_cost:null}]);
    expect(input.idempotencyKey).toMatch(/^po-[0-9a-f]{32}$/);
  });

  it('rejects duplicate products before submitting a purchase draft',async()=>{
    render(<PurchaseOrdersPage/>);
    expect(await screen.findByText('PO-20261019-000001')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/إنشاء مسودة أمر شراء/}));
    fireEvent.change(screen.getAllByLabelText('الصنف')[0],{target:{value:'product-1'}});
    fireEvent.click(screen.getByRole('button',{name:/إضافة صنف/}));
    fireEvent.change(screen.getAllByLabelText('الصنف')[1],{target:{value:'product-1'}});
    fireEvent.click(screen.getByRole('button',{name:/حفظ مسودة أمر الشراء/}));
    expect((await screen.findByRole('alert')).textContent).toMatch(/الصنف مكرر/);
    expect(mocks.createPurchaseOrder).not.toHaveBeenCalled();
  });

  it('rejects quantities with more precision than the target supports',async()=>{
    render(<PurchaseOrdersPage/>);
    expect(await screen.findByText('PO-20261019-000001')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/إنشاء مسودة أمر شراء/}));
    fireEvent.change(screen.getByLabelText('الصنف'),{target:{value:'product-1'}});
    fireEvent.change(screen.getByLabelText('الكمية المطلوبة'),{target:{value:'1.0001'}});
    fireEvent.click(screen.getByRole('button',{name:/حفظ مسودة أمر الشراء/}));
    expect((await screen.findByRole('alert')).textContent).toMatch(/الكمية يجب أن تكون موجبة/);
    expect(mocks.createPurchaseOrder).not.toHaveBeenCalled();
  });

  it('rejects an unsafe unit cost instead of rounding it silently',async()=>{
    render(<PurchaseOrdersPage/>);
    expect(await screen.findByText('PO-20261019-000001')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/إنشاء مسودة أمر شراء/}));
    fireEvent.change(screen.getByLabelText('الصنف'),{target:{value:'product-1'}});
    fireEvent.change(screen.getByLabelText('تكلفة الوحدة (اختياري)'),{target:{value:'12.345'}});
    fireEvent.click(screen.getByRole('button',{name:/حفظ مسودة أمر الشراء/}));
    expect((await screen.findByRole('alert')).textContent).toMatch(/تكلفة الوحدة يجب أن تكون غير سالبة/);
    expect(mocks.createPurchaseOrder).not.toHaveBeenCalled();
  });

  it('rejects a receipt quantity greater than the server-reported remainder',async()=>{
    mocks.fetchPurchaseOrders.mockResolvedValueOnce([submitted]);
    render(<PurchaseOrdersPage/>);
    expect(await screen.findByText('PO-20261019-000001')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/PO-20261019-000001/}));
    fireEvent.change(await screen.findByLabelText('كمية الاستلام سكر'),{target:{value:'2.001'}});
    fireEvent.click(screen.getByRole('button',{name:/ترحيل إيصال الاستلام/}));
    expect((await screen.findByRole('alert')).textContent).toMatch(/كمية استلام سكر/);
    expect(mocks.receivePurchaseOrder).not.toHaveBeenCalled();
  });

});
