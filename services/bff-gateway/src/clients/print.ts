/**
 * Print-service (Python, :50053) gRPC client. Print nhận FAT PAYLOAD
 * (canonical JSON của Batch DTO — hydrate từ batching-service) do BFF push
 * (spec §3.7: Python KHÔNG gọi Go — P1 pin) → trả PDF bytes.
 */
import { PrintServiceClient } from '../../../../api/proto/gen/ts/hubstore/print/v1/print';
import type {
  ListPrintersRequest,
  ListPrintersResponse,
  PrintRequest,
  PrintResponse,
} from '../../../../api/proto/gen/ts/hubstore/print/v1/print';
import { callUnary, insecureChannel, type Caller } from './grpc.js';

export interface PrintApi {
  listPrinters(req: ListPrintersRequest, caller: Caller): Promise<ListPrintersResponse>;
  print(req: PrintRequest, caller: Caller): Promise<PrintResponse>;
  close(): void;
}

export function createPrintClient(addr: string, deadlineMs: number): PrintApi {
  const c = new PrintServiceClient(addr, insecureChannel());
  return {
    listPrinters: (req, caller) => callUnary(c.listPrinters.bind(c), req, caller, deadlineMs),
    print: (req, caller) => callUnary(c.print.bind(c), req, caller, deadlineMs),
    close: () => c.close(),
  };
}
