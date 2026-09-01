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
import { callUnary, insecureChannel } from './grpc.js';

export interface PrintApi {
  listPrinters(req: ListPrintersRequest, role: string): Promise<ListPrintersResponse>;
  print(req: PrintRequest, role: string): Promise<PrintResponse>;
  close(): void;
}

export function createPrintClient(addr: string, deadlineMs: number): PrintApi {
  const c = new PrintServiceClient(addr, insecureChannel());
  return {
    listPrinters: (req, role) => callUnary(c.listPrinters.bind(c), req, role, deadlineMs),
    print: (req, role) => callUnary(c.print.bind(c), req, role, deadlineMs),
    close: () => c.close(),
  };
}
