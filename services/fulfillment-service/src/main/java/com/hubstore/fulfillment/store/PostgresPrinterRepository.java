package com.hubstore.fulfillment.store;

import com.hubstore.fulfillment.store.PrinterRepository.Printer;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;
import java.util.Optional;

/**
 * Postgres store SF-21 — pattern PostgresServiceEmployeeRepository: plain class
 * KHÔNG stereotype (wiring do PrinterRepositoryConfig), JdbcTemplate + RowMapper.
 * - create: duplicate (shop_code, printer_id) từ PK violation → map sang
 *   DuplicatePrinterException ngay tại repo (một chỗ, InMemory cùng semantics).
 * - update: chỉ name/printer_ip/mac/type — identity lấy từ tham số (D9).
 */
public class PostgresPrinterRepository implements PrinterRepository {

    private final JdbcTemplate jdbc;

    private static final RowMapper<Printer> ROW_MAPPER = (rs, n) ->
            new Printer(
                    rs.getString("shop_code"),
                    rs.getString("printer_id"),
                    rs.getString("name"),
                    rs.getString("printer_ip"),
                    rs.getString("mac"),
                    rs.getString("type"));

    public PostgresPrinterRepository(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    // ---------------- reads ----------------

    @Override
    public List<Printer> list(String shopCode) {
        if (shopCode == null || shopCode.isBlank()) {
            return jdbc.query(
                    "SELECT shop_code, printer_id, name, printer_ip, mac, type "
                            + "FROM printers ORDER BY shop_code ASC, printer_id ASC",
                    ROW_MAPPER);
        }
        return jdbc.query(
                "SELECT shop_code, printer_id, name, printer_ip, mac, type "
                        + "FROM printers WHERE shop_code = ? ORDER BY printer_id ASC",
                ROW_MAPPER, shopCode.trim());
    }

    @Override
    public Optional<Printer> get(String shopCode, String printerId) {
        return jdbc.query(
                "SELECT shop_code, printer_id, name, printer_ip, mac, type "
                        + "FROM printers WHERE shop_code = ? AND printer_id = ?",
                ROW_MAPPER, shopCode, printerId).stream().findFirst();
    }

    // ---------------- mutations ----------------

    @Override
    public Printer create(Printer printer) {
        try {
            jdbc.update("INSERT INTO printers "
                            + "(shop_code, printer_id, name, printer_ip, mac, type) "
                            + "VALUES (?, ?, ?, ?, ?, ?)",
                    printer.shopCode(), printer.printerId(), printer.name(),
                    printer.printerIp(), printer.mac(), printer.type());
            return printer;
        } catch (DataIntegrityViolationException e) {
            throw new DuplicatePrinterException(printer.shopCode(), printer.printerId());
        }
    }

    @Override
    public Printer update(String shopCode, String printerId, Printer printer) {
        int n = jdbc.update("UPDATE printers SET name = ?, printer_ip = ?, mac = ?, type = ? "
                        + "WHERE shop_code = ? AND printer_id = ?",
                printer.name(), printer.printerIp(), printer.mac(), printer.type(),
                shopCode, printerId);
        if (n == 0) {
            throw new PrinterNotFoundException(shopCode, printerId);
        }
        return new Printer(shopCode, printerId,
                printer.name(), printer.printerIp(), printer.mac(), printer.type());
    }
}
