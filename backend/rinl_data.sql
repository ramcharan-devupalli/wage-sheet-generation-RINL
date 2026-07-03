--
-- PostgreSQL database dump
--

\restrict aULEhobcPksgM9OoMOb2LgIXnhRUiQ7rExZDgOIjJYePsdnXawUgBc61LITGRYc

-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: attendance; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: contractors; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.contractors (id, rinl_id, contractor_id, engineer_id, name, company, dept_cd, mobile, email, job_start_dt, job_end_dt, present, absent, overtime, status, created_at) VALUES (1, 'RINL-CTR-0001', 'CTR-0001', 'ENG-0001', 'Suresh Kumar', 'Sri Lakshmi Industrial Services', 'SMS', '9876543210', 'suresh.contractor@example.com', '2026-01-01', '2026-12-31', 18.00, 2.00, 12.00, 'active', '2026-07-03 02:30:39.953371');
INSERT INTO public.contractors (id, rinl_id, contractor_id, engineer_id, name, company, dept_cd, mobile, email, job_start_dt, job_end_dt, present, absent, overtime, status, created_at) VALUES (2, 'RINL-CTR-0002', 'CTR-0002', 'ENG-0002', 'Ravi Prasad', 'Vizag Mechanical Works', 'RMHP', '9876543211', 'ravi.contractor@example.com', '2026-02-01', '2026-12-31', 15.00, 1.00, 8.00, 'active', '2026-07-03 02:30:39.953371');


--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.employees (id, rinl_id, emp_id, name, role, mobile, email, password, status, created_at) VALUES (2, 'RINL-AM-6491', 'RINL-AM-6491', 'Ramcharan', 'Admin', '8121467799', 'cherry135000@gmail.com', '1234', 'active', '2026-07-03 02:06:14.839223');
INSERT INTO public.employees (id, rinl_id, emp_id, name, role, mobile, email, password, status, created_at) VALUES (1, 'RINL-AM-01', 'RINL-AM-01', 'Admin Manager', 'Admin', '9346431127', 'admin@vizagsteel.com', '1234', 'active', '2026-07-03 01:51:54.288707');


--
-- Data for Name: login_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.login_logs (id, emp_id, name, role, action, "timestamp", ip_address) VALUES (1, 'RINL-AM-6491', 'Ramcharan', 'Admin', 'LOGIN', '2026-07-03 02:19:42.475434', '::ffff:127.0.0.1');


--
-- Data for Name: login_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.login_sessions (id, emp_id, name, role, login_time, logout_time, ip_address, status) VALUES (1, 'RINL-AM-6491', 'Ramcharan', 'Admin', '2026-07-03 02:19:42.459866', NULL, '::ffff:127.0.0.1', 'active');


--
-- Data for Name: supervisors; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.supervisors (id, rinl_id, supervisor_id, contractor_id, name, mobile, email, status, created_at, present, absent, overtime) VALUES (1, 'RINL-SUP-0001', 'SUP-0001', 'CTR-0001', 'Anil Kumar', '9876500011', 'anil.supervisor@example.com', 'active', '2026-07-03 02:30:39.966244', 18.00, 2.00, 6.00);
INSERT INTO public.supervisors (id, rinl_id, supervisor_id, contractor_id, name, mobile, email, status, created_at, present, absent, overtime) VALUES (2, 'RINL-SUP-0002', 'SUP-0002', 'CTR-0002', 'Kiran Rao', '9876500012', 'kiran.supervisor@example.com', 'active', '2026-07-03 02:30:39.966244', 15.00, 1.00, 4.00);


--
-- Data for Name: wage_sheets; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: workers; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.workers (id, rinl_id, worker_id, name, category, contractor_id, supervisor_id, mobile, gender, daily_wage, status, created_at) VALUES (1, 'RINL-WRK-0001', 'WRK-0001', 'Ramesh Naidu', 'skilled', 'CTR-0001', 'SUP-0001', '9876500101', 'Male', 850.00, 'active', '2026-07-03 02:30:39.969205');
INSERT INTO public.workers (id, rinl_id, worker_id, name, category, contractor_id, supervisor_id, mobile, gender, daily_wage, status, created_at) VALUES (2, 'RINL-WRK-0002', 'WRK-0002', 'Mahesh Babu', 'semi-skilled', 'CTR-0001', 'SUP-0001', '9876500102', 'Male', 700.00, 'active', '2026-07-03 02:30:39.969205');
INSERT INTO public.workers (id, rinl_id, worker_id, name, category, contractor_id, supervisor_id, mobile, gender, daily_wage, status, created_at) VALUES (3, 'RINL-WRK-0003', 'WRK-0003', 'Sita Kumari', 'unskilled', 'CTR-0001', 'SUP-0001', '9876500103', 'Female', 600.00, 'active', '2026-07-03 02:30:39.969205');
INSERT INTO public.workers (id, rinl_id, worker_id, name, category, contractor_id, supervisor_id, mobile, gender, daily_wage, status, created_at) VALUES (4, 'RINL-WRK-0004', 'WRK-0004', 'Naveen Kumar', 'skilled', 'CTR-0002', 'SUP-0002', '9876500104', 'Male', 850.00, 'active', '2026-07-03 02:30:39.969205');
INSERT INTO public.workers (id, rinl_id, worker_id, name, category, contractor_id, supervisor_id, mobile, gender, daily_wage, status, created_at) VALUES (5, 'RINL-WRK-0005', 'WRK-0005', 'Lakshmi Devi', 'semi-skilled', 'CTR-0002', 'SUP-0002', '9876500105', 'Female', 700.00, 'active', '2026-07-03 02:30:39.969205');


--
-- Name: attendance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.attendance_id_seq', 1, false);


--
-- Name: contractors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.contractors_id_seq', 2, true);


--
-- Name: employees_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.employees_id_seq', 3, true);


--
-- Name: login_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.login_logs_id_seq', 1, true);


--
-- Name: login_sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.login_sessions_id_seq', 1, true);


--
-- Name: supervisors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.supervisors_id_seq', 2, true);


--
-- Name: wage_sheets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.wage_sheets_id_seq', 1, false);


--
-- Name: workers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.workers_id_seq', 5, true);


--
-- PostgreSQL database dump complete
--

\unrestrict aULEhobcPksgM9OoMOb2LgIXnhRUiQ7rExZDgOIjJYePsdnXawUgBc61LITGRYc

