import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), columns: "",
  orders: [] as Array<{ column: string; ascending?: boolean }>,
  readResponse: { data: [] as unknown[], error: null as null | { message: string } },
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
import { deleteCustomerAddress, fetchCustomerAddresses, saveCustomerAddress, type CustomerAddressInput } from "@/lib/customer-addresses";

const VALID: CustomerAddressInput = {
  label:"المستودع الرئيسي",recipient_name:"مؤسسة الأغبري",phone:"+967 777 123 456",
  address_line1:"شارع الستين، مبنى 12",address_line2:"البوابة الخلفية",city:"صنعاء",
  region:"أمانة العاصمة",postal_code:"",country:"ye",delivery_instructions:"الاتصال قبل الوصول",is_default:true,
};
function query() {
  const q = {
    select(columns:string) { mocks.columns=columns; return q; },
    order(column:string, options?:{ascending?:boolean}) { mocks.orders.push({column,ascending:options?.ascending}); return q; },
    then(onfulfilled?:((value:typeof mocks.readResponse)=>unknown)|null,onrejected?:((reason:unknown)=>unknown)|null) {
      return Promise.resolve(mocks.readResponse).then(onfulfilled ?? undefined,onrejected ?? undefined);
    },
  };
  return q;
}
describe("customer address book data contract",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();mocks.columns="";mocks.orders.splice(0);mocks.readResponse={data:[],error:null};
    mocks.from.mockImplementation(()=>query());
    mocks.rpc.mockResolvedValue({data:"d1111111-1111-4111-8111-111111111111",error:null});
  });
  it("reads only display-safe fields and sorts the default address first",async()=>{
    const rows=[{id:"d1111111-1111-4111-8111-111111111111",label:"المستودع الرئيسي",is_default:true}];
    mocks.readResponse={data:rows,error:null};
    await expect(fetchCustomerAddresses()).resolves.toEqual(rows);
    expect(mocks.from).toHaveBeenCalledWith("customer_addresses");
    expect(mocks.columns).toBe("id,label,recipient_name,phone,address_line1,address_line2,city,region,postal_code,country,delivery_instructions,is_default,created_at,updated_at");
    expect(mocks.columns).not.toMatch(/organization_id|customer_id/i);
    expect(mocks.orders).toEqual([
      {column:"is_default",ascending:false},{column:"updated_at",ascending:false},{column:"created_at",ascending:false},
    ]);
  });
  it("normalizes fields and never sends customer or organization IDs to write RPCs",async()=>{
    await expect(saveCustomerAddress({...VALID,label:"  المستودع الرئيسي ",recipient_name:" مؤسسة الأغبري "}))
      .resolves.toBe("d1111111-1111-4111-8111-111111111111");
    expect(mocks.rpc).toHaveBeenCalledWith("save_customer_address",{
      p_address_id:null,p_label:"المستودع الرئيسي",p_recipient_name:"مؤسسة الأغبري",
      p_phone:"+967 777 123 456",p_address_line1:"شارع الستين، مبنى 12",p_address_line2:"البوابة الخلفية",
      p_city:"صنعاء",p_region:"أمانة العاصمة",p_postal_code:null,p_country:"YE",
      p_delivery_instructions:"الاتصال قبل الوصول",p_is_default:true,
    });
    expect(JSON.stringify(mocks.rpc.mock.calls[0])).not.toMatch(/customer_id|organization_id/i);
  });
  it("rejects malformed fields before any write",async()=>{
    await expect(saveCustomerAddress({...VALID,phone:"123"})).rejects.toThrow("رقم هاتف صحيح");
    await expect(saveCustomerAddress({...VALID,country:"YEM"})).rejects.toThrow("رمز الدولة");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("shows database errors instead of claiming success",async()=>{
    mocks.rpc.mockResolvedValueOnce({data:null,error:{message:"permission denied"}});
    await expect(saveCustomerAddress(VALID)).rejects.toThrow("permission denied");
  });
  it("requires explicit confirmation from the server before treating deletion as successful",async()=>{
    mocks.rpc.mockResolvedValueOnce({data:true,error:null});
    await expect(deleteCustomerAddress("d1111111-1111-4111-8111-111111111111")).resolves.toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith("delete_customer_address",{p_address_id:"d1111111-1111-4111-8111-111111111111"});
    mocks.rpc.mockResolvedValueOnce({data:false,error:null});
    await expect(deleteCustomerAddress("d1111111-1111-4111-8111-111111111111")).rejects.toThrow("لم يؤكد الخادم");
  });
});
