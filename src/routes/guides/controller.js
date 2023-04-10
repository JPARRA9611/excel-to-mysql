import db from '../../config/db';
import xlsxFile from 'read-excel-file/node';
import fs from 'fs-extra'; 
import excelJS from 'exceljs';
import path from "path";
import process from 'process';

const Select = (sql) => {
  return new Promise(( resolve, reject ) => {
    db.connection.query(sql, 
      (error, results) => {
        if(error) reject(error);
        resolve(results)
      });
  })
}

const buildQueryGuide = (guide, existFilter = false) => {
  const guides = guide.split(',');
  return guides.reduce((prev,current) => {
    if(prev.includes('WHERE') || existFilter){
      return prev + ` OR g.id_guia='${current}'`;
    }else {
      return `WHERE (g.id_guia='${current}'`;
    }
  }, '') + ')';
}

const getImportGuides = async(req, res) => {
  if(!Object.keys(req.query).length){
    res.render("consults", {results:[], payments:[], params: req.query});
    return;
  }
  let filters = '';

  if(req.query.payments && filters === ''){
    filters = ` WHERE pago='${req.query.payments}' `;
  } else if(req.query.payments !== ''){
    filters = filters + ` AND pago='${req.query.payments}' `;
  }

  if(req.query.guide !== '' && filters === ''){
    filters = buildQueryGuide(req.query.guide);
  } else if(req.query.guide !== '') {
    filters = filters + buildQueryGuide(req.query.guide, true);
  }

  if(req.query.empty && filters === ''){
    filters = ` WHERE f.id_factura IS NULL `;
  } else if(req.query.empty){
    filters = filters + ` AND (f.id_factura IS NULL)`;
  }

  const SQL_GUIDE = `SELECT 
    g.id_guia, 
    f.id_factura,
    id_item as num_aceptacion,
    DATE_FORMAT(fecha_aceptacion, "%Y-%m-%d") as fecha_aceptacion,
    sticker,
    DATE_FORMAT(fecha_sticker, "%Y-%m-%d") as fecha_sticker,
    valor, 
    pago, 
    manejo_2,
    manejo_3 from guia_importacion g LEFT JOIN facturas f on g.id_guia=f.id_guia LEFT JOIN itemsxfactura i on f.id_factura = i.id_factura ${filters};`;
  
  const results = await Select(SQL_GUIDE);
  const payment = await Select('SELECT DISTINCT pago from guia_importacion;')
  const payments = payment.map(pay => {
    return {name:pay.pago, selected: pay.pago === req.query.payments}
  });
  res.render("consults", {results, payments, params: req.query, results_text:JSON.stringify(results)});
}

const importGuides = async(req, res) => {
  if(!req.file.path) return false;
  const data = await xlsxFile(req.file.path);
  let i = 0;
  for (const guide of data) {
    if(i !== 0){
      db.connection.query(`SELECT * FROM guia_importacion WHERE id_guia='${guide[0]}'`, 
      (error, results) => {
        if(error)
        throw error;
        if(!results[0]){
          const id_guia = guide[0];
          const pago = guide[2];
          const manejo_2 = guide[3];
          const manejo_3 = guide[4];
          insertGuides(id_guia, pago, manejo_2, manejo_3, guide[1], guide)
        }else {
          insertBills(results[0].id_guia, guide[1], guide);
        }
      });
    }
    
    i++;
  }
  await fs.remove(req.file.path);
  res.render("succes", {message: 'Importación completada'});
}

const insertGuides = (id_guia, pago, manejo_2, manejo_3, id_factura, guide) => {
  const SQL_GUIDE = `INSERT INTO guia_importacion ( id_guia, pago, manejo_2, manejo_3 ) VALUES ( ?,?,?,? )`;
  db.connection.query(SQL_GUIDE,[id_guia, pago, manejo_2, manejo_3], (err, resultInsertGuide) => {
    //if(err) throw err;
    insertBills(id_guia, id_factura, guide);
  });
}

const insertBills = (id_guia, id_factura, guide) => {
  db.connection.query(`SELECT * FROM facturas WHERE id_factura='${id_factura}'`, (err, resultSelectBills) => {
    //if(err) throw err;
    if(!resultSelectBills[0]){
      const SQL_BILLS = `INSERT INTO facturas ( id_guia, id_factura ) VALUES ( ?,? )`;
      db.connection.query(SQL_BILLS, [ id_guia, id_factura], (error, resultInserBill) => {
        //if (error) throw error
        insertItemsForBill(guide[6], guide[7],guide[8], guide[9], guide[5],id_factura)
      })
    } else {
      insertItemsForBill(guide[6], guide[7],guide[8], guide[9], guide[5],id_factura)
    } 
  })
}

const insertItemsForBill = (id_item,acceptance_date,sticker,sticker_date,value,id_factura) => {
  const fecha_aceptacion = new Date(acceptance_date).toISOString().split('T')[0];
  const fecha_sticker = new Date(sticker_date).toISOString().split('T')[0];
  db.connection.query(`SELECT * FROM itemsxfactura WHERE id_item='${id_item}'`, (err, resultSelectItemsXBills) => {
    //if(err) throw err;
    if(!resultSelectItemsXBills[0]){
      const SQL_BILLS = `INSERT INTO itemsxfactura ( id_item, fecha_aceptacion, sticker, fecha_sticker, valor, id_factura ) VALUES ( ?,?,?,?,?,? )`;
      db.connection.query(SQL_BILLS, [ id_item,fecha_aceptacion,sticker,fecha_sticker,value,id_factura], (error, resultInserBill) => {
        //if (error) throw error
      })
    } else {

    } 
  })
}

const exportDataToExcel = async(req, res) => {
  const data = JSON.parse(req.body.results);
  const workbook = new excelJS.Workbook();
  const worksheet = workbook.addWorksheet("Guias de importación");
  const dir = path.join(process.cwd(), "public/downloads/");
  worksheet.columns = [
    { header: "DOCUMENTO DE TRANSPORTE", key: "id_guia", width: 10 }, 
    { header: "FACTURA", key: "id_factura", width: 10 },
    { header: "MODALIDAD", key: "pago", width: 10 },
    { header: "FORMA PAGO", key: "manejo_2", width: 10 },
    { header: "TIPO DE IMPORTACION", key: "manejo_3", width: 10 },
    { header: "VALOR FOB USD", key: "valor", width: 10 },
    { header: "Nº ACEPTACION", key: "num_aceptacion", width: 10 },
    { header: "FECHA ACEPTACION", key: "fecha_aceptacion", width: 10 },
    { header: "STICKER", key: "sticker", width: 10 },
    { header: "FECHA STICKER", key: "fecha_sticker", width: 10 },
  ];

  data.forEach((guide) => {
    const { id_guia, id_factura, pago,manejo_2, manejo_3, valor, num_aceptacion, fecha_aceptacion, sticker, fecha_sticker } = guide;
    worksheet.addRow({
      id_guia,
      id_factura,
      pago,
      manejo_2,
      manejo_3,
      valor,
      num_aceptacion,
      fecha_aceptacion,
      sticker,
      fecha_sticker
    });
  });

  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = {
      type: 'pattern',
      pattern:'solid',
      fgColor:{ argb:'FFFF00' }
    }
    cell.border = {
      top: {style:'thin'},
      left: {style:'thin'},
      bottom: {style:'thin'},
      right: {style:'thin'}
    };
  });

  try {
    const now = new Date().toISOString();
    const name = `guia_importacion_${now}.xlsx`;
    await workbook.xlsx.writeFile(`${dir}${name}`).then(() => {
      const file = `${path.join(process.cwd(), "public/downloads/")}${name}`;
      res.download(file);
    });
  } catch (error) {
    console.log(error,'error')
    res.send({
      status: "error",
      message: "Something went wrong",
    });  
  }
}

module.exports = {
  getImportGuides,
  importGuides,
  exportDataToExcel
}