# A company record that needs two lines from a manager

**Status:** superseded on 2026-10-01 by D91 and the plan
`docs/superpowers/plans/2026-10-01-fewer-manager-questions.md`, which is built. The Owner kept the
unavoidable questions with the manager (nine in all), kept main suppliers, and kept the quiz at
30 questions; the interview has 11. What follows is the proposal as it was written.

## Why

The portal prepares a learner for the banker's KYC questions and lets the Owner decide when the
learner may go and open the account. A manager who handles many DBD packs cannot write twenty
answers for each one. Today a record asks a manager for **24 things** after the PDFs: two contact
details, two lines about the business, four yes/no status facts, seven answers about customers
and suppliers, seven about money and two about the account.

The Owner's decisions of 2026-10-01 already remove most of them. This design finishes the job:
a manager uploads the PDFs and writes **two short lines** (what the business does, what it
sells). Everything else is filled without the manager.

## Where each answer comes from

| Question on the record today | After | Source |
|---|---|---|
| Company email, company phone | Optional; they no longer hold a record back | — |
| What the business does | **Manager writes one line** | Manager |
| Products or services it sells | **Manager writes one line** | Manager |
| Has the company started operating? | Yes unless changed; not asked | Owner's decision |
| Does it already have customers? | Yes unless changed; not asked | Owner's decision |
| Has it completed any sales? | Yes unless changed; not asked | Owner's decision |
| Does it have regular suppliers? | Yes unless changed; not asked | Owner's decision |
| Why was the company established? | Built from the manager's line | Derived |
| Actual place of business | The head office address | DBD |
| Source of funds | The capital the shareholders paid in | DBD |
| Where the first money comes from, and why | The shareholders' capital, to start operating | Fixed answer |
| Why does the company need a bank account? | Owner's wording | Fixed answer |
| Why the company needs PromptPay / QR | Owner's wording | Fixed answer |
| Transactions per month | Monthly revenue ÷ average transaction | Computed |
| What the revenue figure is based on | Built from the two figures | Computed |
| Main customers | Removed, with its topic | Settled |
| Examples of real customers | Removed, with its topic | Settled |
| Main suppliers | Removed, with its topic | Settled |
| Where and how customers are found | Not typed by the manager | Decision 2 |
| What kind of customers | Not typed by the manager | Decision 2 |
| How sales are paid | Not typed by the manager | Decision 2 |
| Monthly revenue | Not typed by the manager | Decision 2 |
| Average amount per transaction | Not typed by the manager | Decision 2 |

**Manager input: 24 → 2.**

### The fixed answers (for the Owner to confirm or correct)

| | Thai | English | Chinese |
|---|---|---|---|
| Why a bank account | เพื่อใช้ทำธุรกรรมทางการเงินของบริษัท รับเงินจากลูกค้าและจ่ายค่าใช้จ่ายของกิจการ | To carry out the company's bank transactions: receiving payments from customers and paying business expenses | 用于公司的银行交易：收取客户款项并支付经营费用 |
| Why PromptPay / QR | ลูกค้านิยมชำระเงินแบบไม่ใช้เงินสด บริษัทจึงต้องมี PromptPay / QR ไว้รับชำระเงิน | Customers prefer cashless payment, so the company needs PromptPay / QR to receive it | 客户更喜欢无现金支付，因此公司需要 PromptPay / 二维码收款 |
| First money into the account | เงินค่าหุ้นที่ผู้ถือหุ้นชำระ เพื่อใช้เป็นเงินทุนเริ่มต้นและเงินหมุนเวียนของกิจการ | The share capital paid by the shareholders, as start-up and working capital | 股东缴纳的股本，用作启动资金和流动资金 |

## Decision 1 — the three removed questions (settled 2026-10-01)

The Owner removed main customers, examples of real customers and main suppliers because they
repeat other questions. The topics leave both evaluations with them:

| Evaluation | Removed | What still covers it |
|---|---|---|
| Business Knowledge Quiz | Question 14, main customers | Question 15, where and how customers are found |
| Business Knowledge Quiz | Question 16, main suppliers | Nothing — see below |
| Bank Readiness Interview | Question 10, main customers | Question 12, what kind of customers |
| Bank Readiness Interview | Question 11, examples of customers | Question 12, what kind of customers |

- The quiz becomes **28 questions**, the interview **11**. None of the three was a critical
  concept, so the nine critical concepts are unchanged.
- Pass marks keep their proportion, for the Owner to confirm: quiz pass at 25, retest at 22;
  interview pass at 9.
- **Suppliers are no longer covered anywhere.** Customers stay covered in both evaluations, but
  main suppliers was the only supplier question, and the bank's own list asks where the main
  clients and suppliers are. A learner would meet that question unprepared.

## Decision 2 — the five answers only the business knows

Where customers are found, what kind of customers, how sales are paid, monthly revenue and the
average transaction are facts about one particular business. No document holds them. Three ways
to take them off the manager:

- **A. The learner supplies them.** At first sign-in the learner answers five short questions
  about their own company, in their own language. The answers go on the record as "given by the
  company" and the learner is then trained and tested on them. The manager sees a record only
  when something is missing.
- **B. A standard answer per business category.** The Owner writes one answer set for each of the
  22 categories; a record takes its category's set automatically. A manager may overwrite.
- **C. A and B together.** The category answer is shown to the learner as a suggestion, and the
  learner confirms or corrects it.

Recommended: **C**. The manager does nothing, and what the learner later tells the banker is
what the learner themself confirmed about the business.

**What to know about B on its own:** the learner would state a monthly revenue and a description
of customers to a bank as the company's own, when nobody at the company gave them. If the
banker's follow-up questions or the account's later activity do not match, that is a problem for
the learner and for the company. The same applies to the status questions: "always yes" trains
every learner to say the company already has customers and completed sales. The design therefore
keeps *yes* as the default rather than a locked value, so it can be changed for a company that
has not started trading.

## How it works

- **A record fills itself.** When the reading is done, the record's empty Level 4 answers are
  filled from the DBD, the fixed answers and the computed values, and marked with their source.
  Validation then accepts the record with no person acting, as it accepts a clean reading today.
- **A new Owner screen, *Standard answers*,** holds the fixed answers (and, under 2B or 2C, the
  category answer sets, next to Business categories).
- **A manager can still overwrite any answer.** An overwritten answer is never replaced again.
- **The form shrinks.** Level 4 shows the answers read-only with their source, and an *Edit*
  that opens them. The status questions move under *Edit*.
- **Existing records** get a *Fill standard answers* button; nothing is filled silently on a
  record a person has already worked on.
- Under 2A or 2C the learner's dashboard gains one step before Study: *Confirm your company's
  answers*.

## Earlier decisions this changes

- D58 / D80: four required details become two.
- D74: "a missing business fact is supplied by a person, never generated" stays true under 2A
  and 2C (the person is the learner); under 2B it becomes "…or by the Owner's standard answers".
- D71 / D78 under 1A: 30 → 28 quiz questions, 13 → 11 interview questions, pass marks restated.

## Out of scope

Uploading many packs at once, translating answers for study cards, and any change to how the
interview is graded.
