# 📚 R.G. Kedia College of Commerce — Library Management System & Degree Exam Guide

An integrated, full-stack **Library Management System and Degree Exam Guide Portal** built for **Ramnath Guljarilal Kedia College of Commerce (R.G. Kedia College)** by **Marwadi Siksha Samithi, Sultan Bazar, Hyderabad** (Estd. 1924).

> *" सा विद्या या विमुक्तये "* — *Knowledge is that which liberates*

---

## 🏛️ Programs & Branches Supported

### 1. Bachelor of Commerce (B.Com)
- General
- Computer Applications
- Business Analytics
- Honors

### 2. Bachelor of Business Administration (BBA)
- General Business Administration

### 3. Bachelor of Science (B.Sc)
- Mathematics
- Statistics
- Computer Science & Data

### 4. Languages
- **First Language**: English (Communicative & Business English)
- **Second Languages**: Telugu (తెలుగు), Sanskrit (संस्कृतम्), Hindi (हिन्दी), Arabic (العربية)

---

## ✨ Key Features

### 👤 Role-Based Portals

#### 1. 🎓 Student Portal
- **Dashboard**: Track active loans, real-time return countdown, overdue warnings, and recommended branch textbooks.
- **Book Catalog**: Real-time search with live physical copy indicators (e.g., *"5 of 8 Copies Available"*), subject segments, and shelf locations.
- **One-Click Borrow Requests**: Submit book reservation and lending requests directly to the librarian.
- **Degree Exam Guide**: Browse past Osmania University exam papers and curated 10-mark/5-mark question banks organized by **Program → Branch → Semester (1-6) → Subject**.

#### 2. 👨‍🏫 Faculty Portal
- **Teacher Dashboard**: Monitor faculty-borrowed reference titles and department resources.
- **Student Copy Lookup**: View exactly which student (Name & Roll Number) is holding each copy of any book and their return due date.
- **Request Student Return**: Send instant return notifications to students for books needed in lectures or seminars.
- **Exam Guide Contributor**: Upload question papers, model question banks, and revision guides for students.

#### 3. 👤 Librarian Admin Console
- **Central Dashboard**: Real-time stats on total inventory, physical copies, active loans, and overdue counts.
- **Book Inventory Management**: Add/edit/delete book titles, manage individual physical copies with unique barcodes, assign shelf rack locations (e.g., `Rack A-1`), and map curriculum relevance.
- **Lending Requests Approval Queue**: Approve/reject student borrow requests with customizable loan durations.
- **Issued Books & Returns**: Active loan tracker with automatic overdue fine calculation (₹2/day) and one-click return processing.
- **Student & Faculty Directory**: Register new members, manage branch specializations, track second language selections, and reset passwords.
- **Exam Guide Repository Manager**: Upload and organize past university papers and solution guides.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS v4, Lucide Icons, React Router v7, React Hot Toast, Axios
- **Backend**: Node.js, Express.js (ESM), TypeScript, Multer
- **Database & ORM**: SQLite, Prisma ORM
- **Authentication**: JWT (JSON Web Tokens), bcryptjs password hashing

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Nikhilgoud7/rg-kedia-library.git
   cd rg-kedia-library
   ```

2. **Install dependencies**:
   ```bash
   # Install server dependencies
   npm install

   # Install client dependencies
   cd client && npm install && cd ..
   ```

3. **Set up the Database & Seed Sample Data**:
   ```bash
   # Generate Prisma client and create SQLite tables
   npx prisma generate
   npx prisma db push

   # Seed sample college books, users, and exam papers
   npx tsx prisma/seed.ts
   ```

4. **Start the Application**:
   ```bash
   npm run dev
   ```

- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:5000/api/health](http://localhost:5000/api/health)

---

## 🔑 Default Demo Accounts

The login page features 1-click test fill buttons:

| Role | Username / Identifier | Password | Program / Branch |
|---|---|---|---|
| **👤 Librarian Admin** | `librarian@rgkedia.edu.in` | `admin123` | Library Administration |
| **👨‍🏫 Faculty Member** | `sunitha.commerce@rgkedia.edu.in` | `password123` | B.Com Faculty |
| **🎓 Student (B.Com)** | `1052-24-401-001` | `password123` | B.Com Computer Applications (Sem 3) |
| **🎓 Student (B.Sc)** | `1052-24-403-008` | `password123` | B.Sc Computer Science & Data (Sem 4) |
| **🎓 Student (BBA)** | `1052-24-402-012` | `password123` | BBA Business Administration (Sem 1) |

---

## 📄 License

Developed for **Ramnath Guljarilal Kedia College of Commerce**, Marwadi Siksha Samithi, Hyderabad.
