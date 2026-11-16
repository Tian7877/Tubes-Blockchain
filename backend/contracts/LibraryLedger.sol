// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title LibraryLedger
/// @notice Simulasi riwayat peminjaman buku Perpustakaan ITB (data dummy, hanya untuk testnet lokal).
/// @dev Riwayat disimpan sebagai event: tidak ada fungsi untuk mengubah atau menghapusnya.
///      Foto kondisi buku TIDAK disimpan di chain, hanya hash-nya. Identitas asli/NIM tidak ada.
contract LibraryLedger {
    // Overdue tidak pernah disimpan; ia dihitung di statusOf() dari waktu jatuh tempo.
    enum Status { Available, Borrowed, Overdue, LostOrDamaged }
    enum IncidentKind { None, Lost, Damaged }

    struct Book {
        bytes32 catalogHash;      // hash data katalog (data lengkapnya off-chain)
        Status status;
        address holder;           // pemegang terakhir (tetap tercatat setelah buku dikembalikan)
        uint64 borrowedAt;
        uint64 dueAt;
        IncidentKind pendingKind; // kasus hilang/rusak yang menunggu persetujuan pengurus
        bytes32 pendingEvidence;
    }

    address public immutable librarian; // pustakawan
    address public immutable steward;   // pengurus
    uint64 public immutable loanPeriod; // lama pinjam (detik)

    uint256 public bookCount;
    mapping(address => bool) public members;
    mapping(uint256 => Book) private books;

    event MemberRegistered(address indexed member);
    event BookAdded(uint256 indexed id, bytes32 catalogHash);
    event Borrowed(uint256 indexed id, address indexed borrower, bytes32 photoHash, uint64 dueAt);
    event Returned(uint256 indexed id, address indexed borrower, bytes32 photoHash, bool late);
    event IncidentReported(uint256 indexed id, address indexed reporter, IncidentKind kind, bytes32 evidenceHash);
    event IncidentApproved(uint256 indexed id, address indexed steward, IncidentKind kind);
    event IncidentRejected(uint256 indexed id, address indexed steward, IncidentKind kind);
    event BookRestored(uint256 indexed id, address indexed steward);

    modifier onlyLibrarian() {
        require(msg.sender == librarian, "not librarian");
        _;
    }

    modifier onlySteward() {
        require(msg.sender == steward, "not steward");
        _;
    }

    constructor(address _librarian, address _steward, uint64 _loanPeriod) {
        require(_librarian != address(0) && _steward != address(0), "zero address");
        require(_loanPeriod > 0, "bad loan period");
        librarian = _librarian;
        steward = _steward;
        loanPeriod = _loanPeriod;
    }

    // ---------------------------------------------------------------- pustakawan

    function registerMember(address member) external onlyLibrarian {
        require(member != address(0), "zero address");
        require(!members[member], "already member");
        members[member] = true;
        emit MemberRegistered(member);
    }

    function addBook(bytes32 catalogHash) external onlyLibrarian returns (uint256 id) {
        require(catalogHash != bytes32(0), "no catalog hash");
        id = ++bookCount;
        books[id].catalogHash = catalogHash;
        emit BookAdded(id, catalogHash);
    }

    // ------------------------------------------------------------------ peminjam

    function borrowBook(uint256 id, bytes32 photoHash) external {
        Book storage b = _book(id);
        require(members[msg.sender], "not member");
        require(b.status == Status.Available, "not available");
        require(photoHash != bytes32(0), "no photo");

        b.status = Status.Borrowed;
        b.holder = msg.sender;
        b.borrowedAt = uint64(block.timestamp);
        b.dueAt = uint64(block.timestamp) + loanPeriod;
        emit Borrowed(id, msg.sender, photoHash, b.dueAt);
    }

    function returnBook(uint256 id, bytes32 photoHash) external {
        Book storage b = _book(id);
        require(b.status == Status.Borrowed, "not borrowed");
        require(b.holder == msg.sender, "not holder");
        require(photoHash != bytes32(0), "no photo");

        bool late = block.timestamp > b.dueAt;
        b.status = Status.Available;
        b.borrowedAt = 0;
        b.dueAt = 0;
        emit Returned(id, msg.sender, photoHash, late);
    }

    // ------------------------------------------------- kasus hilang atau rusak

    /// Pustakawan melaporkan. Belum sah sebelum pengurus menyetujui.
    function reportIncident(uint256 id, IncidentKind kind, bytes32 evidenceHash) external onlyLibrarian {
        Book storage b = _book(id);
        require(kind != IncidentKind.None, "bad kind");
        require(b.status != Status.LostOrDamaged, "already lost/damaged");
        require(b.pendingKind == IncidentKind.None, "case pending");
        require(kind == IncidentKind.Lost || evidenceHash != bytes32(0), "no evidence");

        b.pendingKind = kind;
        b.pendingEvidence = evidenceHash;
        emit IncidentReported(id, msg.sender, kind, evidenceHash);
    }

    function approveIncident(uint256 id) external onlySteward {
        Book storage b = _book(id);
        require(b.pendingKind != IncidentKind.None, "no pending case");

        IncidentKind kind = b.pendingKind;
        b.status = Status.LostOrDamaged;
        b.pendingKind = IncidentKind.None;
        b.pendingEvidence = bytes32(0);
        b.borrowedAt = 0;
        b.dueAt = 0;
        emit IncidentApproved(id, msg.sender, kind);
    }

    function rejectIncident(uint256 id) external onlySteward {
        Book storage b = _book(id);
        require(b.pendingKind != IncidentKind.None, "no pending case");

        IncidentKind kind = b.pendingKind;
        b.pendingKind = IncidentKind.None;
        b.pendingEvidence = bytes32(0);
        emit IncidentRejected(id, msg.sender, kind);
    }

    /// Buku diganti/diperbaiki. Riwayat lama tetap ada; ini hanya menambah catatan baru.
    function restoreBook(uint256 id) external onlySteward {
        Book storage b = _book(id);
        require(b.status == Status.LostOrDamaged, "not lost/damaged");
        b.status = Status.Available;
        emit BookRestored(id, msg.sender);
    }

    // --------------------------------------------------------------------- baca

    function statusOf(uint256 id) public view returns (Status) {
        Book storage b = _book(id);
        if (b.status == Status.Borrowed && block.timestamp > b.dueAt) return Status.Overdue;
        return b.status;
    }

    /// Mengembalikan data buku dengan status yang sudah memperhitungkan keterlambatan.
    function getBook(uint256 id) external view returns (Book memory b) {
        b = _book(id);
        b.status = statusOf(id);
    }

    function _book(uint256 id) private view returns (Book storage) {
        require(id != 0 && id <= bookCount, "no such book");
        return books[id];
    }
}
